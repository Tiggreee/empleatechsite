import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Privacidad",
  description: `Qué datos usa ${APP_NAME} y su extensión de Chrome, dónde se guardan y con quién se comparten (con nadie).`,
};

const ACTUALIZADA = "1 de octubre de 2026";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-texto py-6">
      <h2 className="text-2xl font-black tracking-tight">{titulo}</h2>
      <div className="mt-3 space-y-3 text-tenue">{children}</div>
    </section>
  );
}

/** Política de privacidad pública (la pide la Chrome Web Store para publicar la extensión). Se lee sin iniciar sesión. */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-tenue">Actualizada el {ACTUALIZADA}</p>
      <h1 className="mt-3 text-5xl font-black leading-[0.9] tracking-[-0.04em]">Privacidad</h1>
      <p className="mt-4 text-lg text-tenue">
        {APP_NAME} es un asistente personal de búsqueda de empleo. Tus datos son tuyos: se usan solo para buscarte vacantes, prepararte cada postulación y llenar
        formularios cuando tú lo pides. No se venden, no se comparten y no se usan para publicidad.
      </p>

      <Seccion titulo="Qué datos usa la app">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu CV y lo que la app entiende de él (experiencia, habilidades, estudios, datos de contacto).</li>
          <li>Tus respuestas para formularios (país, modalidad, salario esperado, idiomas, permiso de trabajo) y las que aprende cuando contestas preguntas nuevas.</li>
          <li>Las vacantes encontradas, tus postulaciones y su seguimiento.</li>
          <li>Tu acceso: la contraseña se guarda solo como huella (hash); el secreto de la verificación en dos pasos, cifrado.</li>
        </ul>
        <p>
          Se guardan en la base de datos de tu {APP_NAME} (PostgreSQL en Neon) y la app corre en Vercel. Las cookies son solo las de tu sesión; no hay cookies de
          terceros, analítica ni anuncios.
        </p>
      </Seccion>

      <Seccion titulo="Qué hace la extensión de Chrome">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            En formularios de postulación de Greenhouse, Lever y Ashby lee las preguntas del formulario y las llena con tu perfil; adjunta tu CV y tu carta para esa
            vacante. En Workana, Upwork y Freelancer.com lee el texto del proyecto abierto y pone tu propuesta en su cuadro.
          </li>
          <li>Nunca envía nada: el botón «Enviar» siempre lo presionas tú. No marca casillas de términos ni resuelve captchas.</li>
          <li>
            Para saber que enviaste el formulario, detecta el clic en su botón de envío y la página de confirmación. No registra otros clics, ni lo que escribes en
            otras páginas.
          </li>
          <li>
            Cuando envías, manda a tu {APP_NAME} la dirección y el título de esa página (para registrar la postulación) y tus respuestas a preguntas nuevas (para
            llenarlas la próxima vez).
          </li>
          <li>En las páginas de tu {APP_NAME} solo avisa que está instalada y recibe la conexión cuando pulsas «Conectar la extensión».</li>
          <li>
            Cuando pulsas «Guardar CV en Word», guarda ese archivo en tu carpeta Descargas, dentro de una carpeta del día (por ejemplo CV11-11), y borra los CV
            que ella misma guardó en carpetas de días anteriores a ayer. No lee ni toca ningún otro archivo de tu computadora.
          </li>
          <li>
            Guarda en tu navegador (almacenamiento local de la extensión) la dirección de tu {APP_NAME} y un token de conexión. Nada más. Desinstalarla los borra.
          </li>
        </ul>
        <p>
          La extensión solo habla con tu {APP_NAME} (empleatech.site, o la dirección que tú configures), siempre cifrado (HTTPS) en internet. No manda datos a
          ningún otro servidor, no lee otras páginas y no registra tu historial de navegación.
        </p>
      </Seccion>

      <Seccion titulo="Lo que declaramos en la Chrome Web Store">
        <p>Estas son las categorías de datos que maneja la extensión, con el alcance exacto de cada una:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-texto">Información de identificación personal:</strong> tu nombre, correo, teléfono, ciudad y enlaces profesionales, tomados
            de tu perfil para llenar formularios.
          </li>
          <li>
            <strong className="text-texto">Información de autenticación:</strong> el token de conexión con tu cuenta, guardado solo en tu navegador.
          </li>
          <li>
            <strong className="text-texto">Historial web:</strong> solo la dirección y el título de la página del formulario que envías, para registrar esa
            postulación.
          </li>
          <li>
            <strong className="text-texto">Actividad del usuario:</strong> solo el clic en el botón de envío de esos formularios.
          </li>
          <li>
            <strong className="text-texto">Contenido de sitios web:</strong> las preguntas del formulario, tus respuestas a preguntas nuevas y el texto del proyecto
            freelance abierto.
          </li>
        </ul>
        <p>
          El uso que {APP_NAME} hace de la información recibida de la extensión se ajusta a la Política de datos de usuario de Chrome Web Store, incluidos los
          requisitos de Uso limitado: solo se usa para el propósito de la extensión (llenar tus postulaciones y registrarlas), no se vende, no se transfiere a
          terceros, no se usa para publicidad ni para evaluar crédito, y nadie la lee salvo que tú lo pidas para darte soporte o que la ley lo exija.
        </p>
      </Seccion>

      <Seccion titulo="Con quién se comparten">
        <p>
          Con nadie. Los únicos servicios que los alojan son la base de datos (Neon) y el hospedaje (Vercel), que los guardan y los sirven para {APP_NAME} y no
          los usan para nada más. Los datos de una postulación llegan a una empresa solo cuando tú envías su formulario.
        </p>
      </Seccion>

      <Seccion titulo="Tu control">
        <ul className="list-disc space-y-1 pl-5">
          <li>Puedes ver, corregir y borrar tu CV, tus respuestas y tus postulaciones desde la app.</li>
          <li>Cerrar sesión en todos lados o cambiar tu contraseña desconecta también la extensión.</li>
          <li>Desinstalar la extensión borra lo que guardaba en tu navegador.</li>
        </ul>
      </Seccion>

      <Seccion titulo="In English">
        <p>
          {APP_NAME} is a personal job-search assistant. Its Chrome extension fills job application forms (Greenhouse, Lever, Ashby) and freelance proposals
          (Workana, Upwork, Freelancer.com) with your own {APP_NAME} profile, and only when you ask. It never submits anything for you. It talks only to your{" "}
          {APP_NAME} server, stores only that server address and a connection token in the extension&apos;s local storage, and sends your data to no third party.
          When you click «Guardar CV en Word», it saves that CV to a dated folder inside your Downloads folder and deletes only CVs it saved there more than a
          day ago (the &quot;downloads&quot; permission); it never reads or touches any other file.
          No data is sold, shared, or used for advertising; there are no analytics or third-party cookies. Data categories handled: personally identifiable
          information (profile used to fill forms), authentication information (connection token), web history (only the URL and title of the application
          page you submit), user activity (only the click on that form&apos;s submit button) and website content (form questions, your answers to new
          questions, the open freelance project text). The use of information received from the extension adheres to the Chrome Web Store User Data Policy,
          including the Limited Use requirements.
        </p>
      </Seccion>

      <Seccion titulo="Contacto">
        <p>Dudas o solicitudes sobre tus datos: escribe al correo de contacto del desarrollador que aparece en la ficha de {APP_NAME} en la Chrome Web Store.</p>
      </Seccion>
    </main>
  );
}
