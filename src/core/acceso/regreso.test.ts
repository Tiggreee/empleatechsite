import { describe, expect, it } from "vitest";
import { rutaDeRegreso } from "./regreso";

const ORIGEN = "https://empleatech.site";

describe("a dónde volver después de entrar", () => {
  it("rutas de la app, con su búsqueda y su ancla", () => {
    expect(rutaDeRegreso("/vacantes?pestana=guardadas#v-3", ORIGEN)).toBe("/vacantes?pestana=guardadas#v-3");
    expect(rutaDeRegreso("/perfil", ORIGEN)).toBe("/perfil");
  });

  it("nunca a otro sitio, aunque el texto lo disfrace", () => {
    for (const v of ["//malo.example", "/\\malo.example", "/\t/malo.example", "/\n/malo.example", "https://malo.example/hoy", "malo.example"]) {
      expect(rutaDeRegreso(v, ORIGEN), JSON.stringify(v)).toBe("/hoy");
    }
  });

  it("sin destino, o de vuelta a /entrar, va a tus vacantes de hoy", () => {
    expect(rutaDeRegreso(null, ORIGEN)).toBe("/hoy");
    expect(rutaDeRegreso("", ORIGEN)).toBe("/hoy");
    expect(rutaDeRegreso("/entrar?volver=/hoy", ORIGEN)).toBe("/hoy");
  });
});
