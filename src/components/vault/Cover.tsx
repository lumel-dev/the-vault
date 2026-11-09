"use client";

import { useState } from "react";
import { coverUrl, type CoverSize } from "@/lib/covers";
import { cn } from "@/lib/utils";
import { Sticker } from "./Sticker";

interface Props {
  type: string;
  name: string;
  coverSource?: string | null;
  coverRef?: string | null;
  size?: CoverSize;
  className?: string;
}

/**
 * La tapa de un objeto, en proporción de caja de DVD (2:3). Sin tapa (o si TMDB no la sirve) se
 * dibuja la caja vacía: plástico negro con el nombre escrito en un pedazo de cinta y el sticker
 * del tipo, que es como se rotula en casa algo que no tiene tapa. La app nunca guarda imágenes.
 */
export function Cover({ type, name, coverSource, coverRef, size = "md", className }: Props) {
  const url = coverUrl(coverSource, coverRef, size);
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = url && failed !== url;

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-[3px] bg-[#161617]", className)}>
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
        <div className="flex size-full flex-col justify-between p-[9%] [container-type:inline-size]">
          <Sticker type={type} className="size-[16%] min-h-2.5 min-w-2.5" />
          <span className="tape line-clamp-4 -rotate-2 px-[0.5em] py-[0.25em] text-[clamp(0.6rem,7cqi,1rem)] leading-tight [overflow-wrap:anywhere]">
            {name}
          </span>
        </div>
      )}
      {/* El borde de la caja de plástico. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/25 ring-inset" />
    </div>
  );
}
