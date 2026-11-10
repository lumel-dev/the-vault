"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { inventoryLabel } from "@/lib/containers";
import { subtitle } from "@/lib/item-types";
import type { VaultItem } from "@/lib/queries";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Cover } from "./Cover";
import { Sticker } from "./Sticker";

/**
 * La tarjeta de la grilla. Nombre y datos van al mismo tamaño: la jerarquía la dan el peso y el
 * color, así la grilla densa se lee pareja (lo que el mundo tomó del horario de bolsillo).
 */
export function ItemCardBody({ item, lifted = false, striking = false, selected = false, caption }: { item: VaultItem; lifted?: boolean; striking?: boolean; selected?: boolean; caption?: string }) {
  const { t } = useI18n();
  // Con la grilla ordenada por género o año, la línea chica muestra eso: así se ve el agrupamiento.
  const sub = caption ?? subtitle(item.type, item.attributes, t, item.brand, item.model);
  return (
    <div className="group/card relative">
      <div className="relative">
        <Cover
          type={item.type}
          name={item.name}
          coverSource={item.coverSource}
          coverRef={item.coverRef}
          className={cn(
            "shadow-[0_6px_14px_-6px_rgb(28_27_25/55%)] transition duration-200 ease-out",
            lifted ? "shadow-[0_22px_40px_-12px_rgb(28_27_25/70%)]" : "group-hover/card:-translate-y-1",
            selected && "ring-3 ring-marker ring-offset-2 ring-offset-background",
          )}
        />
        {striking && (
          <svg aria-hidden viewBox="0 0 100 150" preserveAspectRatio="none" className="absolute inset-0 size-full text-marker-red">
            <path d="M8 10 92 140M90 8 10 142" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
          </svg>
        )}
      </div>
      <div className={cn("mt-2 grid gap-0.5 text-[0.8125rem] leading-snug", striking && "line-through decoration-marker-red decoration-2")}>
        <p className="line-clamp-2 font-semibold">{item.name}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Sticker type={item.type} className="size-2.5" />
          <span className="truncate">{sub || inventoryLabel(item.inventoryNumber, t)}</span>
        </p>
      </div>
    </div>
  );
}

/** Una tarjeta de la grilla: se arrastra para reordenar o para soltarla sobre un contenedor. */
export function ItemCard({ item, onOpen, striking, selected, sortable = true, caption }: { item: VaultItem; onOpen: (item: VaultItem) => void; striking: boolean; selected: boolean; sortable?: boolean; caption?: string }) {
  // Con la grilla ordenada por nombre, año, etc. no se reordena a mano: el orden lo da el criterio.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !sortable });
  const { t } = useI18n();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation list-none", isDragging && "opacity-30")}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full cursor-pointer rounded-[3px] text-left outline-none focus-visible:ring-3 focus-visible:ring-marker active:cursor-grabbing"
        aria-label={t.grid.cardAria(item.name)}
        {...attributes}
        {...listeners}
      >
        <ItemCardBody item={item} striking={striking} selected={selected} caption={caption} />
      </button>
    </li>
  );
}
