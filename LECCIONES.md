# Lecciones

Cada vuelta al proyecto deja de 3 a 5 lecciones: qué falló, qué costó de más y qué funcionó. Son la evidencia del
siguiente plan.

## 2026-10-12 · De «ya está en producción» a usarla de verdad

- **El CI estuvo en rojo tres días y nadie lo vio**, porque Vercel despliega aunque GitHub falle. Revisar el CI es parte
  de decir «está listo».
- **Un parche escondía la causa.** La config de Playwright tronaba con solo leerse; la solución fue validar la base al
  correr las pruebas, no al cargar la config. Antes de mergear un arreglo, preguntar qué arregla de raíz.
- **Una prueba fallaba 1 de cada ~1000 veces** porque «alteraba» datos aleatorios con un valor fijo. Una prueba no debe
  depender del azar.
- **La app preguntaba lo que el CV ya decía** (años, inglés). Antes de pedirle algo a la persona, sacarlo de lo que ya
  dio; lo que declare a mano manda, y en un formulario nunca se afirma más de lo que el CV o la persona dicen.
- **Semanas construyendo y cero postulaciones.** La métrica que importa (respuestas, entrevistas) no se mueve sin uso
  real: primero se usa y se mide, después se construye.

## 2026-10-17 · Auditoría antes de la primera postulación

- **El CI volvió a quedar en rojo cuatro días sin que nadie lo viera.** La regla de `main` existía, pero el push
  directo como administrador se la saltaba. Desde ahora todo entra por PR y se espera el CI antes de mergear.
- **La prueba «inestable» era un bug real.** Al soltar la tarjeta, la distancia salía del último render de React; en un
  deslizamiento rápido el dedo se levanta antes y la decisión se perdía. Antes de culpar al azar, buscar la carrera.
- **Guardar todo el estado funcionaba con un solo escritor.** Con la extensión como segundo, una pestaña con datos
  viejos borraba la postulación recién registrada. Se escribe solo lo que cambió, renglón por renglón.
- **Un 100 sin evidencia.** «Partner Development Manager» salía primero por inglés y liderazgo, sin ninguna herramienta
  técnica. La afinidad necesita una base mínima antes de valer como prioridad.
- **«US-REMOTE; CA-TOR» no se leía como país**, así que vacantes que exigen vivir en EE. UU. pasaban el filtro. Revisar
  la cola con ojos de usuario encontró en minutos lo que las pruebas no cubrían.
