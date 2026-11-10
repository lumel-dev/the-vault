"use client";

import { useEffect, useRef, useState } from "react";
import { coverUrl, type CoverSize } from "@/lib/covers";
import { useI18n } from "@/lib/i18n/client";
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
  const { t } = useI18n();
  // Un intento con la URL tal cual y otro con una URL distinta (por si la caché tiene una copia
  // sin CORS de antes); recién si fallan los dos, la tapa genérica.
  const [attempt, setAttempt] = useState<{ url: string | null; n: number }>({ url, n: 0 });
  const n = attempt.url === url ? attempt.n : 0;
  const src = url && n === 1 ? `${url}?cors=1` : url;
  const showImage = url && n < 2;
  const img = useRef<HTMLImageElement>(null);

  // La imagen viene renderizada del server: si falló antes de que React hidratara, onError nunca
  // llega. Al montar se mira si ya terminó sin pixeles y se reintenta igual.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0 && url) setAttempt({ url, n: n + 1 });
  }, [src, url, n]);

  return (
    <div className={cn("relative aspect-[2/3] overflow-hidden rounded-[3px] bg-[#161617]", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- se sirve directo desde TMDB, sin optimizador
        <img
          ref={img}
          src={src!}
          alt={t.form.coverAlt(name)}
          loading="lazy"
          // En modo CORS siempre: TMDB sólo manda el header CORS si el pedido trae Origin, y la
          // copia que Chrome cachea de un <img> común después bloquea la textura del 3D.
          crossOrigin="anonymous"
          draggable={false}
          onError={() => setAttempt({ url, n: n + 1 })}
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
