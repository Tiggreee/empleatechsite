# Arquitectura

## Resumen

EmpleaTech corre en internet (https://empleatech.site) y también completa en una sola computadora:

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4** para las pantallas y los Route Handlers (`/api/*`).
- **Postgres con `pg` y SQL plano**: Neon en producción, Docker en local. Es la única fuente de verdad.
- **Vercel** sirve la app, corre las migraciones al construir y lanza la búsqueda diaria (`vercel.json`, 13:00 UTC).
- **Extensión de Chrome (MV3)** en `extension/`: llena formularios de Greenhouse, Lever, Ashby y Braintrust, y arma
  propuestas en Workana, Upwork y Freelancer. Tú siempre presionas «Enviar».

## Capas

```
features, components, ui, storage   (pantallas)
        │  solo por /api; de server/ toman únicamente tipos
        ▼
app/api   (Route Handlers)  ──►  server   (SQL, fuentes de vacantes, sesión, PDF)
        │                              │
        └──────────────►  core  ◄──────┘   (dominio puro: análisis, puntaje, radar, perfil, tracker)
```

`src/arquitectura.test.ts` revisa estas fronteras en cada `npm test`: `core` no importa nada de afuera (ni React ni
Next), `server` no conoce las pantallas y las pantallas no llaman al servidor directo.

## Flujos principales

| Flujo | Cómo funciona |
|---|---|
| **Tus datos** | La pantalla lee todo con `GET /api/state` y, al guardar, manda **solo lo que cambió** (`PATCH`, ver `core/estado/cambios.ts`). El servidor escribe renglón por renglón y responde con todo al día. Así la extensión, otra pestaña y esta no se pisan. |
| **Búsqueda de vacantes** | `server/fuentes/*` adapta cada plataforma a una `Vacante`. `core/vacantes/busqueda.ts` busca desde **todas** las herramientas de tu CV (rota cuáles van primero cada hora), filtra y quita duplicados. |
| **Puntaje** | Afinidad contra tu CV (`core/analisis`), radar de fraude (`core/radar`) y tus preferencias, con cada factor explicado. Si una vacante no pide herramientas técnicas, su afinidad tiene tope: el inglés o el liderazgo solos no la suben a 100. Al cambiar tu CV, tus respuestas o las reglas (`VERSION_PUNTAJE`), las vacantes guardadas se vuelven a puntuar solas. |
| **Documentos a la medida** | `core/documentos/aMedida.ts` arma CV, carta y propuesta solo con lo que dice tu CV; `server/pdf.ts` los convierte a PDF. |
| **Extensión** | Habla con `/api/autollenado` con un token propio. Registra la postulación cuando el sitio confirma el envío. |

## Seguridad

- Una sola cuenta: contraseña con hash, verificación en dos pasos (TOTP) con secreto cifrado y códigos de respaldo.
- Tokens firmados con HMAC-SHA256 que llevan el sello de la cuenta: cambiar la contraseña o cerrar sesión en todos
  lados invalida los anteriores. `src/proxy.ts` revisa la sesión antes de cada página y API.
- Límite de intentos guardado en la base (`intentos_acceso`), porque en Vercel cada petición puede caer en otra
  instancia.
- CSP, HSTS y demás encabezados en `next.config.ts`; después de entrar solo se vuelve a rutas internas
  (`core/acceso/regreso.ts`).

## Tablas

`profiles`, `cvs`, `job_postings`, `analysis_results`, `tracker_entries`, `radar_flags` (tu perfil y tu tracker);
`vacantes` y `consultas_fuente` (búsqueda); `acceso` e `intentos_acceso` (inicio de sesión). Migraciones en
`migrations/`.

## Decisiones

| Decisión | Por qué |
|---|---|
| Route Handlers de Next en vez de un servidor aparte | Menos piezas: un solo despliegue y una sola sesión. |
| `pg` + SQL plano, sin ORM | El esquema es chico y relacional; el SQL se lee y se prueba directo. |
| Escribir solo lo que cambió | Antes se reemplazaba todo el estado en cada guardado; con la extensión como segundo escritor, una pestaña con datos viejos borraba lo que la extensión acababa de registrar. |
| Análisis explicable (reglas y catálogo), no un modelo | Cada punto del puntaje dice de dónde sale y se puede probar. |
| Una sola cuenta | Es una herramienta personal. Abrirla a más usuarios exige multiusuario y aviso de privacidad (LFPDPPP). |

## Calidad

CI en cada cambio (`.github/workflows/ci.yml`): lint, knip (código muerto), tipos, ~350 pruebas unitarias y e2e con
Playwright sobre el build de producción, en escritorio y celular, con su propio Postgres. Además, CodeQL, Dependabot y
0% de código duplicado (jscpd).

## Operación

- **Local:** ver `docs/DEPLOY.md` (`npm run arrancar` levanta Docker, migra, construye y respalda).
- **Producción:** cada cambio en `main` despliega en Vercel; `vercel-build` corre las migraciones antes de construir.
