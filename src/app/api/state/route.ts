import { sanitizarCambios } from "@/core/estado/cambios";
import { leerJson, ok, respuestaError } from "@/server/api";
import { aplicarCambios, clearState, loadState } from "@/server/app-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES_CAMBIOS = 1_000_000;

export async function GET() {
  try {
    return ok(await loadState());
  } catch (error) {
    return respuestaError(error);
  }
}

/** Solo lo que cambió (ver core/estado/cambios); responde con tus datos completos ya al día. */
export async function PATCH(request: Request) {
  try {
    return ok(await aplicarCambios(sanitizarCambios(await leerJson(request, MAX_BYTES_CAMBIOS))));
  } catch (error) {
    return respuestaError(error);
  }
}

export async function DELETE() {
  try {
    await clearState();
    return ok({ ok: true });
  } catch (error) {
    return respuestaError(error);
  }
}
