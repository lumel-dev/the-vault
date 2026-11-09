import type { Metadata, Viewport } from "next";
import { Archivo, Permanent_Marker } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Archivo para la interfaz; el fibrón (Permanent Marker) sólo para rótulos, el logo y lo marcado.
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans-app" });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-marker-app" });

export const metadata: Metadata = {
  title: { default: "The Vault", template: "%s · The Vault" },
  description: "Lo que tenés y dónde está: tus estantes, cajas y muebles, con cada cosa en su lugar.",
};

export const viewport: Viewport = {
  themeColor: "#c4935c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${marker.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
