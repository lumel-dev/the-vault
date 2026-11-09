import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-app" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display-app", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: { default: "The Vault", template: "%s · The Vault" },
  description: "Tu colección, a la vista: películas, series y todo lo que guardás.",
};

export const viewport: Viewport = {
  themeColor: "#15171c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
