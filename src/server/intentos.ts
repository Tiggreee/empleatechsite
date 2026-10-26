import { ErrorHttp } from "./api";
import { getPool, withTransaction } from "./db";

/**
 * Límite de intentos contra quien pruebe contraseñas o códigos a lo bruto. Vive en la base: en Vercel cada petición
 * puede caer en otra instancia y una cuenta en memoria se reiniciaría sola.
 *
 * Cada intento se aparta ANTES de revisar la contraseña (cuenta como fallo hasta que se demuestre lo contrario) y la
 * fila se bloquea mientras tanto: aunque manden 100 a la vez, no se cuelan más de 5.
 */

export const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60_000;

/** Los códigos de la app se cuentan por cuenta (no por IP): para llegar ahí ya hizo falta tu contraseña. */
export const CLAVE_CODIGOS = "cuenta:2fa";

/** Aparta un intento; si esa clave está bloqueada, corta con 429 y dice cuánto esperar. */
export async function apartarOBloquear(clave: string): Promise<void> {
  const espera = await apartarIntento(clave);
  if (espera) throw new ErrorHttp(429, `Demasiados intentos. Espera ${espera} min.`);
}
const TOPE_MS = 24 * 3600_000;
/** Un día sin fallos y se olvida el historial (los bloqueos vuelven a empezar en 15 minutos). */
const OLVIDO_MS = 24 * 3600_000;

export interface Intentos {
  fallos: number;
  /** Cuántas veces se ha bloqueado seguidas: cada una dura el doble. */
  bloqueos: number;
  /** Hasta cuándo está bloqueado (ms; 0 = no está bloqueado). */
  hasta: number;
  /** Último fallo (ms). */
  ultimo: number;
}

/** Minutos que faltan de bloqueo (0 = puede intentar). */
export function minutosDeEspera(i: Intentos | undefined, ahora: number): number {
  return i && i.hasta > ahora ? Math.ceil((i.hasta - ahora) / 60_000) : 0;
}

/** Un fallo más. Cada 5 seguidos bloquea: 15 minutos, luego 30, 60… hasta un día. */
export function trasFallo(previo: Intentos | undefined, ahora: number): Intentos {
  const base = !previo || ahora - Math.max(previo.ultimo, previo.hasta) > OLVIDO_MS ? { fallos: 0, bloqueos: 0 } : previo;
  const fallos = base.fallos + 1;
  if (fallos < MAX_FALLOS) return { fallos, bloqueos: base.bloqueos, hasta: 0, ultimo: ahora };
  const bloqueos = base.bloqueos + 1;
  return { fallos: 0, bloqueos, hasta: ahora + Math.min(BLOQUEO_MS * 2 ** (bloqueos - 1), TOPE_MS), ultimo: ahora };
}

/**
 * De dónde viene la petición. Solo en Vercel el encabezado es confiable: su red lo escribe y descarta el que mande el
 * cliente. En cualquier otro lado alguien podría inventarse una IP por intento, así que todo cuenta como un solo origen.
 */
export function ipDeCliente(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL !== "1") return "directo";
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocido";
}

const ms = (d: Date | null) => (d ? d.getTime() : 0);

/** Aparta un intento. Devuelve los minutos de espera si está bloqueado (y entonces no cuenta nada). */
export async function apartarIntento(clave: string, ahora = Date.now()): Promise<number> {
  return withTransaction(async (c) => {
    await c.query(`insert into intentos_acceso (clave, ultimo) values ($1, $2) on conflict (clave) do nothing`, [clave, new Date(ahora)]);
    const { rows } = await c.query<{ fallos: number; bloqueos: number; hasta: Date | null; ultimo: Date }>(
      `select fallos, bloqueos, hasta, ultimo from intentos_acceso where clave = $1 for update`,
      [clave],
    );
    const fila = rows[0];
    const previo: Intentos | undefined = fila && { fallos: fila.fallos, bloqueos: fila.bloqueos, hasta: ms(fila.hasta), ultimo: ms(fila.ultimo) };
    const espera = minutosDeEspera(previo, ahora);
    if (espera) return espera;
    const s = trasFallo(previo, ahora);
    await c.query(`update intentos_acceso set fallos = $2, bloqueos = $3, hasta = $4, ultimo = $5 where clave = $1`, [
      clave,
      s.fallos,
      s.bloqueos,
      s.hasta ? new Date(s.hasta) : null,
      new Date(s.ultimo),
    ]);
    return 0;
  });
}

/** El intento salió bien: borrón y cuenta nueva para ese origen. */
export async function limpiarIntentos(clave: string): Promise<void> {
  await getPool().query(`delete from intentos_acceso where clave = $1`, [clave]);
}

/** Limpieza diaria: orígenes que ya no están bloqueados ni han fallado en dos días. */
export async function olvidarIntentosViejos(ahora = Date.now()): Promise<void> {
  const limite = new Date(ahora - 2 * OLVIDO_MS);
  await getPool().query(`delete from intentos_acceso where ultimo < $1 and (hasta is null or hasta < $2)`, [limite, new Date(ahora)]);
}
