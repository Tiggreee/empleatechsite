# Extensión en la Chrome Web Store

Todo lo que pide el panel de desarrollador (https://chrome.google.com/webstore/devconsole) para publicar la extensión,
listo para copiar. Cuenta: de **no comerciante** (la extensión es gratis, sin anuncios ni cobros).

## Paquete

1. `npm run extension` → sube `extension/empleatech-<versión>.zip` (el manifest va en la raíz).
2. Para una versión nueva: sube `version` en `extension/manifest.json`, vuelve a empaquetar y sube el zip en «Paquete».
3. Iconos y mosaico: `npm run tienda`. Capturas: `npx playwright test -c playwright.tienda.config.ts`. Todo queda en
   `extension/iconos` y `extension/tienda`.

## Ficha de la tienda

- **Nombre:** EmpleaTech (sale del manifest).
- **Resumen (máx. 132):** Llena tus formularios de postulación y tus propuestas freelance con tu perfil de EmpleaTech. Tú revisas y tú envías.
- **Categoría:** Productividad → Herramientas.
- **Idioma:** Español (Latinoamérica).
- **Descripción** (sin enumerar plataformas: la primera versión se rechazó por «spam de palabras clave», Yellow Argon,
  por listar seis nombres de sitios; tampoco van en el mosaico ni en la marquesina):

  > EmpleaTech es tu asistente personal de búsqueda de empleo. Esta extensión es su compañera en el navegador: cuando
  > abres el formulario de una vacante, lo llena por ti con tu perfil y deja todo listo para que tú lo revises y lo envíes.
  >
  > Qué hace:
  > • En los formularios de postulación de las plataformas de reclutamiento compatibles, llena tus datos, contesta las preguntas que ya conoce, adjunta tu CV y tu carta para esa vacante y marca en rojo lo que falta.
  > • En las plataformas de proyectos freelance compatibles, arma una propuesta para el proyecto que tienes abierto y la pone en su cuadro.
  > • Cuando envías, registra la postulación en tu seguimiento y aprende tus respuestas nuevas para la próxima vez.
  >
  > Qué no hace:
  > • Nunca envía nada: el botón «Enviar» siempre lo presionas tú.
  > • No marca casillas de términos ni resuelve captchas.
  > • No lee otras páginas ni manda tus datos a nadie más que a tu EmpleaTech.
  >
  > Necesitas una cuenta de EmpleaTech (https://empleatech.site). Para conectarla: en EmpleaTech abre Mi CV → Autollenado y pulsa «Conectar la extensión».

- **Icono:** `extension/iconos/icono-128.png`.
- **Capturas (1280×800):** `extension/tienda/captura-1-formulario.png` y `captura-2-propuesta.png`. (La 3, de la app,
  muestra un texto que nombra plataformas: no se sube, para no arriesgar otro rechazo por palabras clave.)
- **Mosaico promocional pequeño (440×280):** `extension/tienda/mosaico-440x280.png`.
- **Sitio web oficial:** https://empleatech.site
- **URL de asistencia:** https://empleatech.site/privacidad

## Prácticas de privacidad

- **Propósito único:** Llenar formularios de postulación a empleos y propuestas freelance con el perfil del usuario guardado en su cuenta de EmpleaTech, siempre a petición del usuario y sin enviarlos por él.
- **Justificación de permisos:**
  - `storage`: guarda solo la dirección de la cuenta de EmpleaTech del usuario y su token de conexión.
  - Permiso de host `https://empleatech.site/*`: la extensión pide a la cuenta del usuario su perfil, su CV y su carta para la vacante abierta, y registra la postulación cuando el usuario la envía.
  - Permisos de host `http://localhost/*` y `http://127.0.0.1/*`: para quien usa EmpleaTech instalado en su propia computadora.
  - Permiso opcional `https://*/*`: solo se pide (con aviso de Chrome) si el usuario aloja su EmpleaTech en otra dirección y la escribe en las opciones.
  - Scripts de contenido en Greenhouse, Lever, Ashby y Braintrust (formularios de postulación) y en Workana, Upwork y Freelancer.com (propuestas): leen las preguntas del formulario o el texto del proyecto y escriben las respuestas cuando el usuario pulsa el botón de la extensión. En empleatech.site y localhost: solo avisan que la extensión está instalada y reciben la conexión de un clic.
- **¿Usa código remoto?** No. Todo el código va en el paquete.
- **Datos que maneja** (marcar; declarar de más no se penaliza, declarar de menos sí):
  - Información de identificación personal (nombre, correo, teléfono, ciudad y LinkedIn del perfil, para llenar formularios).
  - Información de autenticación (el token de conexión, guardado solo en el navegador).
  - Historial web (solo la URL y el título de la página del formulario que el usuario envía).
  - Actividad del usuario (solo el clic en el botón de envío de esos formularios).
  - Contenido de sitios web (preguntas del formulario, respuestas a preguntas nuevas y texto del proyecto abierto).
  - No marcar: salud, finanzas, comunicaciones personales, ubicación.
- **Certificaciones** (marcar las tres): no se venden ni transfieren datos a terceros fuera de los casos permitidos; no se usan para fines ajenos al propósito único; no se usan para determinar solvencia ni para préstamos.
- **Política de privacidad:** https://empleatech.site/privacidad

## Distribución

- **Visibilidad:** No listada (solo con el enlace). Cuando EmpleaTech tenga cuentas para más personas, cambiar a Pública.
- **Regiones:** todas.
- Al aprobarse, poner la URL de la ficha en `URL_EXTENSION_TIENDA` (`src/config/app.ts`): Autollenado mostrará el botón de instalar.

## Notas para quien revisa

> La extensión es la compañera de una aplicación web personal (https://empleatech.site) y necesita una cuenta conectada
> para llenar datos. Sin cuenta, en un formulario de Greenhouse, Lever, Ashby o Braintrust aparece su panel («Llenar con EmpleaTech»)
> y al pulsarlo explica que falta conectarla. No envía formularios ni recolecta datos fuera de los sitios listados.
