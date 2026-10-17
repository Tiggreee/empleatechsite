import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import PuertaDatos from "@/components/PuertaDatos";
import PwaBarra from "@/components/PwaBarra";
import { APP_NAME } from "@/config/app";
import { SITIO } from "@/content/sitio";
import { DatosProvider } from "@/storage/hooks";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const DESCRIPCION = `${APP_NAME} analiza tu CV contra ofertas reales, detecta riesgos y guarda CVs, análisis y postulaciones en Postgres local para que puedas probar tu propio flujo end to end.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: { default: `${APP_NAME} — Asistente personal de búsqueda de empleo`, template: `%s — ${APP_NAME}` },
  description: DESCRIPCION,
  applicationName: APP_NAME,
  openGraph: { title: `${APP_NAME} — Asistente personal de búsqueda de empleo`, description: DESCRIPCION, siteName: APP_NAME, locale: "es_MX", type: "website" },
  twitter: { card: "summary_large_image", title: `${APP_NAME} — Asistente personal de búsqueda de empleo`, description: DESCRIPCION },
};

export const viewport: Viewport = { themeColor: "#f3f3ef", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#contenido" className="saltar">
          Saltar al contenido
        </a>
        <DatosProvider>
          <PwaBarra />
          <Nav conSesion={process.env.EMPLEATECH_AUTH === "1"} />
          <div id="contenido" tabIndex={-1} className="flex-1 outline-none">
            <PuertaDatos>{children}</PuertaDatos>
          </div>
          <footer className="border-t-2 border-texto px-5 py-6 text-center font-mono text-xs text-tenue">
            <p>{APP_NAME} no envía postulaciones por ti. Tú decides qué guardar, qué descartar y qué enviar.</p>
            <p className="mx-auto mt-2 max-w-3xl">Tus CVs, ofertas guardadas y postulaciones viven en tu propia base de datos, solo para ti. Puedes exportarlos o borrarlos cuando quieras.</p>
            <p className="mt-3">
              <a href="/privacidad" className="uppercase tracking-widest underline underline-offset-4 hover:text-texto">
                Privacidad
              </a>
            </p>
          </footer>
        </DatosProvider>
      </body>
    </html>
  );
}

