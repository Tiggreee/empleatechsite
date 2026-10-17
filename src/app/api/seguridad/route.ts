import { SITIO } from "@/content/sitio";
import { evaluarContrasena } from "@/core/acceso/fuerza";
import { ErrorHttp, leerJson, respuestaError } from "@/server/api";
import { hashear, verificar } from "@/server/contrasena";
import {
  activarTotp,
  cambiarHash,
  desactivarTotp,
  guardarTotpPendiente,
  leerCuenta,
  reemplazarCodigosRespaldo,
  renovarSello,
  type Cuenta,
} from "@/server/cuenta";
import { comprobarSegundoFactor, conSesion, palabrasDelSitio, sesionVigente, sinCache } from "@/server/dosPasos";
import { CLAVE_CODIGOS, apartarOBloquear as apartar, ipDeCliente, limpiarIntentos } from "@/server/intentos";
import { accesoConContrasena, secretoDeSesion } from "@/server/sesion";
import { cifrar, descifrar, huellaRespaldo, nuevoSecretoTotp, nuevosCodigosRespaldo, secretoLegible, uriTotp, verificarTotp } from "@/server/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tu sesión y tu cuenta, o error. El proxy ya filtró, pero aquí se vuelve a revisar: es la puerta de lo delicado. */
async function cuentaConSesion(request: Request): Promise<Cuenta> {
  if (!accesoConContrasena()) throw new ErrorHttp(404, "En tu computadora no hace falta: solo ella puede abrir EmpleaTech.");
  if (!(await sesionVigente(request))) throw new ErrorHttp(401, "Inicia sesión.");
  const cuenta = await leerCuenta();
  if (!cuenta) throw new ErrorHttp(409, "Primero crea tu contraseña.");
  return cuenta;
}

export async function GET(request: Request) {
  try {
    const cuenta = await cuentaConSesion(request);
    return sinCache({ dosPasos: cuenta.totpActivo, codigosRestantes: cuenta.codigosRespaldo.length });
  } catch (error) {
    return respuestaError(error);
  }
}

export async function POST(request: Request) {
  try {
    const cuenta = await cuentaConSesion(request);
    const body = await leerJson(request, 5_000);
    const ip = `ip:${ipDeCliente(request.headers)}`;
    const texto = (v: unknown) => (typeof v === "string" ? v : "");

    /** Lo delicado pide tu contraseña aunque ya tengas sesión: una sesión olvidada abierta no basta. */
    const confirmarContrasena = async (dada: unknown) => {
      await apartar(ip);
      if (!(await verificar(texto(dada), cuenta.hash))) throw new ErrorHttp(401, "Tu contraseña actual no es correcta.");
      await limpiarIntentos(ip);
    };
    const confirmarCodigo = async (codigo: unknown) => {
      await apartar(CLAVE_CODIGOS);
      const r = await comprobarSegundoFactor(cuenta, codigo);
      if (!r.ok) throw new ErrorHttp(401, r.mensaje);
      await limpiarIntentos(CLAVE_CODIGOS);
    };

    switch (body.accion) {
      case "cambiar-contrasena": {
        await confirmarContrasena(body.actual);
        const nueva = texto(body.nueva);
        const fuerza = evaluarContrasena(nueva, palabrasDelSitio());
        if (!fuerza.valida) throw new ErrorHttp(400, fuerza.problemas[0]);
        if (nueva === texto(body.actual)) throw new ErrorHttp(400, "La nueva contraseña debe ser distinta de la actual.");
        return conSesion({ ok: true }, await cambiarHash(await hashear(nueva)));
      }

      case "cerrar-sesiones":
        return conSesion({ ok: true }, await renovarSello());

      case "preparar-2fa": {
        if (cuenta.totpActivo) throw new ErrorHttp(409, "La verificación en dos pasos ya está activa.");
        await confirmarContrasena(body.contrasena);
        const secreto = nuevoSecretoTotp();
        await guardarTotpPendiente(cifrar(secreto, secretoDeSesion()));
        return sinCache({ secreto: secretoLegible(secreto), uri: uriTotp(secreto, new URL(SITIO).host) });
      }

      case "activar-2fa": {
        if (cuenta.totpActivo) throw new ErrorHttp(409, "La verificación en dos pasos ya está activa.");
        const secreto = cuenta.totpSecreto ? descifrar(cuenta.totpSecreto, secretoDeSesion()) : null;
        if (!secreto) throw new ErrorHttp(409, "Empieza de nuevo: pulsa «Activar».");
        const paso = verificarTotp(secreto, texto(body.codigo), Date.now(), null);
        if (paso === null) throw new ErrorHttp(400, "El código no coincide. Revisa que la hora de tu teléfono sea automática y escribe el que aparece ahora.");
        const codigos = nuevosCodigosRespaldo();
        return conSesion({ ok: true, codigos }, await activarTotp(paso, codigos.map(huellaRespaldo)));
      }

      case "desactivar-2fa": {
        if (!cuenta.totpActivo) throw new ErrorHttp(409, "La verificación en dos pasos no está activa.");
        await confirmarContrasena(body.contrasena);
        await confirmarCodigo(body.codigo);
        return conSesion({ ok: true }, await desactivarTotp());
      }

      case "nuevos-codigos": {
        if (!cuenta.totpActivo) throw new ErrorHttp(409, "La verificación en dos pasos no está activa.");
        await confirmarCodigo(body.codigo);
        const codigos = nuevosCodigosRespaldo();
        await reemplazarCodigosRespaldo(codigos.map(huellaRespaldo));
        return sinCache({ codigos });
      }

      default:
        throw new ErrorHttp(400, "Acción desconocida.");
    }
  } catch (error) {
    return respuestaError(error);
  }
}
