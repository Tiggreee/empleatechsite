# EmpleaTech

Un asistente personal de búsqueda de empleo, pensado desde cero para el mercado hispanohablante y LatAm — no una traducción de una herramienta gringa.

## ¿Qué resuelve?

Buscar trabajo hoy significa mandar cientos de aplicaciones a ciegas, sin saber realmente qué tan bien encajas con cada vacante, y sin protección frente a ofertas fraudulentas o abusivas que abundan en las bolsas de trabajo de México y LatAm. EmpleaTech ataca ambos problemas a la vez.

## Qué hace

- **Sube tu CV** (PDF, Word o texto) una sola vez.
- **Compara tu CV contra cualquier vacante** y te dice, con evidencia citada (no una caja negra), qué tanto encajas: qué requisitos cumples, cuáles te faltan, y qué habilidades transferibles puedes usar a tu favor.
- **Detecta ofertas riesgosas o fraudulentas** antes de que pierdas tiempo o dinero: cobros disfrazados, pago solo por comisión, exigencia de datos sensibles, prestaciones inexistentes y otros patrones comunes en ofertas engañosas de la región.
- **Te da una prioridad clara por oferta** — a qué aplicar primero y por qué — en vez de dejarte adivinar.
- **Lleva el seguimiento de tus postulaciones**: en qué status va cada una, notas, próximos pasos y cuándo darle seguimiento.
- **Todo tu historial queda guardado** para que puedas ver tu progreso real con el tiempo, no solo la foto de un día.

## Por qué existe

Después de meses buscando empleo activamente y mandando cientos de aplicaciones, la conclusión fue simple: las herramientas que existen o son caras, o están pensadas para otro mercado, o no protegen al usuario de ofertas abusivas. EmpleaTech es un intento honesto de resolver eso, construido y probado con datos y aplicaciones reales, no con datos de ejemplo.

## Cómo está hecho

Next.js 16, React 19, TypeScript y Tailwind 4; Postgres (Neon) con SQL plano; desplegado en Vercel, con una extensión de
Chrome (MV3) que llena los formularios. Capas separadas y vigiladas por pruebas, CI con pruebas unitarias y end-to-end en
cada cambio. Detalles en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Estado del proyecto

En producción en https://empleatech.site y en uso real para una búsqueda de empleo activa.

---

Proyecto personal de [Victor Salgado](https://github.com/Tiggreee).