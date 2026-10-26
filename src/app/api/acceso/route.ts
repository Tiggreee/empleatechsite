import { createHash, timingSafeEqual } from "node:crypto";
import { evaluarContrasena } from "@/core/acceso/fuerza";
import { ErrorHttp, leerJson, respuestaError } from "@/server/api";
import { hashear, verificar } from "@/server/contrasena";
import { crearCuenta, leerCuenta } from "@/server/cuenta";
import { comprobarSegundoFactor, conPaso2, conSesion, palabrasDelSitio, sesionVigente, sinCache, sinSesion } from "@/server/dosPasos";
import { CLAVE_CODIGOS, apartarOBloquear as apartar, ipDeCliente, limpiarIntentos } from "@/server/intentos";
import { accesoConContrasena, crearToken, secretoDeSesion } from "@/server/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** El código de un solo uso se compara en tiempo constante (sobre su huella, para que midan lo mismo). */
function codigoCorrecto(dado: unknown): boolean {
  const esperado = process.env.EMPLEATECH_CODIGO_INICIAL?.trim() ?? "";
  if (esperado.length < 16 || typeof dado !== "string") return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(dado.trim()), h(esperado));
}

export async function GET(request: Request) {
  try {
    if (!accesoConContrasena()) return sinCache({ requerido: false, configurado: true, sesion: true, segundoPaso: false });
    const [cuenta, sesion, paso2] = await Promise.all([leerCuenta(), sesionVigente(request), sesionVigente(request, "paso2")]);
    return sinCache({ requerido: true, configurado: !!cuenta, sesion: !!sesion, segundoPaso: !sesion && !!paso2 });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!accesoConContrasena()) throw new ErrorHttp(404, "El inicio de sesión no está activado en esta instalación.");
    const body = await leerJson(request, 5_000);
    const ip = `ip:${ipDeCliente(request.headers)}`;
    const contrasena = typeof body.contrasena === "string" ? body.contrasena : "";

    if (body.accion === "token-extension") {
      const sello = await sesionVigente(request);
      if (!sello) throw new ErrorHttp(401, "Inicia sesión primero.");
      return sinCache({ token: await crearToken("extension", secretoDeSesion(), sello) });
    }

    if (body.accion === "crear") {
      await apartar(ip);
      if (!codigoCorrecto(body.codigo)) throw new ErrorHttp(401, "El código de acceso no es correcto.");
      await limpiarIntentos(ip);
      const fuerza = evaluarContrasena(contrasena, palabrasDelSitio());
      if (!fuerza.valida) throw new ErrorHttp(400, fuerza.problemas[0]);
      const sello = await crearCuenta(await hashear(contrasena));
      if (!sello) throw new ErrorHttp(409, "Ya existe una contraseña. Inicia sesión.");
      return conSesion({ ok: true }, sello);
    }

    if (body.accion === "entrar") {
      // El intento se aparta antes de revisar: así ni mandando muchos a la vez se pasan del límite.
      await apartar(ip);
      const cuenta = await leerCuenta();
      if (!cuenta) throw new ErrorHttp(409, "Primero crea tu contraseña con tu código de acceso.");
      if (!(await verificar(contrasena, cuenta.hash))) throw new ErrorHttp(401, "Contraseña incorrecta.");
      await limpiarIntentos(ip);
      return cuenta.totpActivo ? conPaso2(cuenta.sello) : conSesion({ ok: true }, cuenta.sello);
    }

    if (body.accion === "segundo-paso") {
      const sello = await sesionVigente(request, "paso2");
      const cuenta = await leerCuenta();
      if (!sello || !cuenta?.totpActivo) throw new ErrorHttp(401, "Tu inicio de sesión venció. Escribe tu contraseña otra vez.");
      await apartar(CLAVE_CODIGOS);
      const r = await comprobarSegundoFactor(cuenta, body.codigo);
      if (!r.ok) throw new ErrorHttp(401, r.mensaje);
      await limpiarIntentos(CLAVE_CODIGOS);
      return conSesion({ ok: true, codigosRestantes: r.restantes }, cuenta.sello);
    }

    throw new ErrorHttp(400, "Acción desconocida.");
  } catch (error) {
    return respuestaError(error);
  }
}

/** Cerrar sesión (en este navegador; para todos lados está /seguridad). */
export async function DELETE() {
  return sinSesion({ ok: true });
}
