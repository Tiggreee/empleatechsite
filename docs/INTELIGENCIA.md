# Inteligencia y linaje

## De dónde sale la app

- **Del recon competitivo**: la idea de contrastar herramientas de búsqueda de empleo con evidencia pública y una tabla que no inventa capacidades.
- **Del prototipo previo**: el analizador CV→oferta, el radar y el tracker base.
- **De esta iteración**: persistencia real en Postgres (Neon en producción, Docker en local) para que el historial personal también sirva como dataset práctico.

## Qué cambió en esta versión

- La persistencia principal ya no depende solo de `localStorage`.
- Cada oferta guardada deja rastro estructurado en tablas separadas.
- El panel y el tracker siguen usando la misma lógica explicable de prioridad y seguimiento.

## Lo que se dejó fuera a propósito

- Automatización para enviar postulaciones sin intervención humana.
- Generación de contenido con LLMs.
- Integraciones pagas o marketing dentro del MVP.

## Pendientes

Ver `PENDIENTES` en `src/content/inteligencia.ts` para OCR, autocompletado asistido, cuentas/multi-dispositivo, agregador de vacantes y mejoras del diccionario de habilidades.

