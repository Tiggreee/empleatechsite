# Arquitectura cloud

## Hoy

- **App:** Vercel (Next.js 16), dominio https://empleatech.site.
- **Base:** Postgres administrado en Neon; las migraciones corren en cada build (`vercel-build`).
- **Tareas programadas:** Vercel Cron llama `/api/cron/buscar` una vez al día con `CRON_SECRET`.
- **Secretos:** variables de entorno de Vercel (`DATABASE_URL`, `EMPLEATECH_SECRETO`, `CRON_SECRET`, …); nunca en
  el repositorio.
- **CI/CD:** GitHub Actions corre lint, tipos, pruebas unitarias y e2e en cada cambio; Vercel despliega `main`.

En local todo corre igual con Docker (ver `docs/DEPLOY.md`).

## Camino posible hacia OCI

Si un día conviene moverla (costo, control o para practicar OCI):

1. **Aplicación:** imagen de contenedor de Next.js en OCI Container Instances o en una VM; los Route Handlers siguen
   siendo la API del mismo servicio.
2. **Base de datos:** OCI Database with PostgreSQL o Postgres en una VM; solo cambia `DATABASE_URL`.
3. **Migraciones:** `npm run migrate` en el pipeline antes de arrancar.
4. **Búsqueda diaria:** un job programado (OCI Functions o cron en la VM) que llame `/api/cron/buscar` con su clave.
5. **Operación:** respaldos automáticos de la base, monitoreo de la app y alertas.

## Lo que falta para más de un usuario

Hoy hay una sola cuenta. Para abrirla a otras personas: tablas con `user_id` en cada renglón, registro de cuentas,
aviso de privacidad y derechos ARCO (LFPDPPP), y límites de uso por cuenta.
