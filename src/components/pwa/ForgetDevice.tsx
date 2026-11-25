"use client";

import { useEffect } from "react";
import { forgetCollection } from "@/lib/offline/idb";

/**
 * En el login y el registro: este browser deja de tener guardada la colección de quien estaba
 * (IndexedDB y la página que guarda el service worker). En una computadora compartida, el que
 * entra después no la ve sin señal. Lo que quedó sin subir se conserva: entra con su dueño.
 */
export function ForgetDevice() {
  useEffect(() => {
    void forgetCollection();
    if ("caches" in window) void caches.delete("vault-shell").catch(() => {});
  }, []);
  return null;
}
