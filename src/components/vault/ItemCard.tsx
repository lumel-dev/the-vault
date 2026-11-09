"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { subtitle } from "@/lib/item-types";
import type { VaultItem } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Cover } from "./Cover";

export function ItemCardBody({ item, lifted = false }: { item: VaultItem; lifted?: boolean }) {
  const sub = subtitle(item.type, item.attributes, item.brand, item.model);
  return (
    <div className="group/card">
      <Cover
        type={item.type}
        name={item.name}
        coverSource={item.coverSource}
        coverRef={item.coverRef}
        className={cn(
          "shadow-lg shadow-black/40 transition duration-200",
          lifted ? "shadow-2xl shadow-black/70 ring-2 ring-primary" : "group-hover/card:-translate-y-1 group-hover/card:shadow-xl",
        )}
      />
      <div className="mt-2 px-0.5">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** Una tarjeta de la grilla: se arrastra para reordenar o para soltarla sobre un estante. */
export function ItemCard({ item, onOpen }: { item: VaultItem; onOpen: (item: VaultItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation list-none", isDragging && "opacity-30")}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full cursor-grab rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={`${item.name}. Enter para ver el detalle; espacio para arrastrar.`}
        {...attributes}
        {...listeners}
      >
        <ItemCardBody item={item} />
      </button>
    </li>
  );
}
