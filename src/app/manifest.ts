import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA, en `/manifest.webmanifest`. Los íconos los genera `scripts/icons.mjs`
 * desde `src/app/icon.svg`. Los colores van en hex porque el manifest no lee variables de CSS:
 * `--concrete` (el fondo de la app) y `--kraft` (la barra de arriba) de `globals.css`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Vault",
    short_name: "The Vault",
    description: "Lo que tenés y dónde está: tus estantes, cajas y muebles, con cada cosa en su lugar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#d9dad6",
    theme_color: "#c4935c",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Sin un `maskable` propio, Android recorta el `any` y le come las esquinas.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
