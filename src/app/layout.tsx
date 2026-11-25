import type { Metadata, Viewport } from "next";
import { Archivo, Permanent_Marker } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n/client";
import { getMessages } from "@/lib/i18n/server";
import "./globals.css";

// Archivo para la interfaz; el fibrón (Permanent Marker) sólo para rótulos, el logo y lo marcado.
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans-app" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker-app" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getMessages();
  return {
    title: { default: "The Vault", template: "%s · The Vault" },
    description: t.meta.description,
    // Instalada en iOS: pantalla completa, con su ícono (el manifest lo lee Android y escritorio).
    appleWebApp: { capable: true, title: "The Vault", statusBarStyle: "default" },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#c4935c",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getMessages();
  return (
    <html lang={locale} className={`${sans.variable} ${marker.variable}`}>
      <body className="min-h-dvh font-sans">
        <I18nProvider locale={locale}>
          {children}
          <Toaster position="bottom-center" />
          <RegisterServiceWorker />
        </I18nProvider>
      </body>
    </html>
  );
}
