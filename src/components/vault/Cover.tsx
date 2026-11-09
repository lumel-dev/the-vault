"use client";

import { useState } from "react";
import { coverUrl, type CoverSize } from "@/lib/covers";
import { cn } from "@/lib/utils";
import { TypeIcon } from "./TypeIcon";

interface Props {
  type: string;
  name: string;
  coverSource?: string | null;
  coverRef?: string | null;
  size?: CoverSize;
  className?: string;
}

/** Un tono estable por nombre, para que cada tapa genérica sea distinta pero siempre la misma. */
function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/**
 * La tapa de un objeto, en proporción de caja de DVD (2:3). Si no hay tapa o la API no la sirve,
 * se dibuja una genérica con el ícono del tipo y el nombre: la app nunca guarda imágenes.
 */
export function Cover({ type, name, coverSource, coverRef, size = "md", className }: Props) {
  const url = coverUrl(coverSource, coverRef, size);
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = url && failed !== url;
  const hue = hueOf(name);

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-lg bg-muted", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- se sirve directo desde TMDB, sin optimizador
        <img
          src={url}
          alt={`Tapa de ${name}`}
          loading="lazy"
          draggable={false}
          onError={() => setFailed(url)}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="flex size-full flex-col justify-between p-3"
          style={{
            background: `linear-gradient(155deg, oklch(0.36 0.06 ${hue}) 0%, oklch(0.22 0.03 ${(hue + 40) % 360}) 100%)`,
          }}
        >
          <TypeIcon type={type} className="size-7 text-white/50" strokeWidth={1.5} />
          <span className="line-clamp-4 font-display text-[0.95em] leading-tight font-bold text-white/85 [overflow-wrap:anywhere]">
            {name}
          </span>
        </div>
      )}
      {/* Brillo de caja plástica sobre la tapa. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-transparent via-transparent to-white/10 ring-1 ring-white/10 ring-inset" />
    </div>
  );
}
