"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js`. No dibuja nada.
 *
 * - La URL lleva el id del build: un deploy nuevo es otra URL y el browser instala el worker nuevo.
 *   `updateViaCache: "none"` evita que el propio `sw.js` salga de la caché HTTP (un worker zombie).
 * - En la primera visita la página y sus chunks se cargaron antes de que existiera el worker: se
 *   le pide que guarde la bóveda (`keep-shell`) y lo que ya se bajó de `/_next/static/`, incluido
 *   el 3D si se abrió. Si no, la app no abriría sin señal hasta la segunda visita.
 * - Sólo en producción: en dev el worker pelea con el HMR.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

    function share(worker: ServiceWorker) {
      if (window.location.pathname === "/" && document.querySelector("[data-vault-shell]")) worker.postMessage({ type: "keep-shell" });
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(`${window.location.origin}/_next/static/`));
      worker.postMessage({ type: "cache-urls", urls });
    }

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (reg.active) share(reg.active);
        // El 3D se baja después (al abrir la vista Mueble): se avisa de nuevo al rato.
        window.setTimeout(() => reg.active && share(reg.active), 15_000);
      })
      .catch((error) => {
        // Sin worker la app anda igual con señal, que es el caso normal.
        console.error("[pwa] no se pudo registrar el service worker", error);
      });
  }, []);

  return null;
}
