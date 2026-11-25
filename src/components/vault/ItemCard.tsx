"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { inventoryLabel } from "@/lib/containers";
import { subtitle } from "@/lib/item-types";
import type { VaultItem } from "@/lib/queries";
import { itemShape } from "@/lib/scene-layout";
import { isLight, spineColor } from "@/lib/spines";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Cover } from "./Cover";
import { Sticker } from "./Sticker";

/** Cómo se ve la grilla: tapas grandes, tapas chicas, una lista o los lomos en un estante. */
export const DENSITIES = ["covers", "small", "list", "spines"] as const;
export type Density = (typeof DENSITIES)[number];

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value);
}

function Strike() {
  return (
    <svg aria-hidden viewBox="0 0 100 150" preserveAspectRatio="none" className="absolute inset-0 size-full text-marker-red">
      <path d="M8 10 92 140M90 8 10 142" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * La tarjeta de la grilla. Nombre y datos van al mismo tamaño: la jerarquía la dan el peso y el
 * color, así la grilla densa se lee pareja (lo que el mundo tomó del horario de bolsillo).
 */
export function ItemCardBody({
  item,
  lifted = false,
  striking = false,
  selected = false,
  caption,
  small = false,
}: {
  item: VaultItem;
  lifted?: boolean;
  striking?: boolean;
  selected?: boolean;
  caption?: string;
  /** Tapas chicas: el nombre en una línea y sin la línea de datos. */
  small?: boolean;
}) {
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
          size={small ? "sm" : "md"}
          className={cn(
            "shadow-[0_6px_14px_-6px_rgb(28_27_25/55%)] transition duration-200 ease-out",
            lifted ? "shadow-[0_22px_40px_-12px_rgb(28_27_25/70%)]" : "group-hover/card:-translate-y-1",
            selected && "ring-3 ring-marker ring-offset-2 ring-offset-background",
          )}
        />
        {striking && <Strike />}
      </div>
      <div className={cn("grid gap-0.5 leading-snug", small ? "mt-1 text-[0.6875rem]" : "mt-2 text-[0.8125rem]", striking && "line-through decoration-marker-red decoration-2")}>
        <p className={cn("font-semibold", small ? "truncate" : "line-clamp-2")}>
          {item.name}
          {small && item.attributes.season ? ` · T${item.attributes.season}` : ""}
        </p>
        {!small && (
          <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Sticker type={item.type} className="size-2.5" />
            <span className="truncate">{sub || inventoryLabel(item.inventoryNumber, t)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** Una fila de la lista: tapa chiquita, nombre, datos y número de inventario. */
function ItemRowBody({ item, striking, selected, caption }: { item: VaultItem; striking: boolean; selected: boolean; caption?: string }) {
  const { t } = useI18n();
  const sub = caption ?? subtitle(item.type, item.attributes, t, item.brand, item.model);
  return (
    <div className={cn("flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-card/70", selected && "bg-card ring-2 ring-marker")}>
      <div className="relative w-8 shrink-0">
        {item.coverSource && item.coverRef ? (
          <Cover type={item.type} name={item.name} coverSource={item.coverSource} coverRef={item.coverRef} size="sm" className="shadow-[0_3px_8px_-4px_rgb(28_27_25/55%)]" />
        ) : (
          // Sin tapa, a este tamaño el rótulo no se lee: la caja negra con su sticker alcanza.
          <div className="flex aspect-[2/3] items-start rounded-[2px] bg-[#161617] p-1 shadow-[0_3px_8px_-4px_rgb(28_27_25/55%)]">
            <Sticker type={item.type} className="size-2" />
          </div>
        )}
        {striking && <Strike />}
      </div>
      <div className={cn("grid min-w-0 flex-1 text-sm leading-snug", striking && "line-through decoration-marker-red decoration-2")}>
        <p className="truncate font-semibold">{item.name}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <Sticker type={item.type} className="size-2.5" />
          <span className="truncate">{sub || t.types[item.type as keyof typeof t.types]?.label}</span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{inventoryLabel(item.inventoryNumber, t)}</span>
    </div>
  );
}

/**
 * Milímetros del objeto real a píxeles de la vista de lomos. El ancho va exagerado (un DVD mide
 * 14 mm: a escala no entra el título) y el alto a escala, para que se note qué es un VHS, un libro
 * o un vinilo.
 */
const WIDTH_PX_PER_MM = 2.2;
const HEIGHT_PX_PER_MM = 0.8;

/**
 * Un lomo, como se ve en el estante: el ancho y el alto salen de las medidas reales del objeto
 * (`itemShape`), el color y el título de abajo hacia arriba, igual que en la vista 3D.
 */
function SpineBody({ item, striking, selected }: { item: VaultItem; striking: boolean; selected: boolean }) {
  const { shape, dims } = itemShape(item);
  const parcel = shape === "parcel";
  const width = Math.min(64, Math.max(20, dims.t * 1000 * WIDTH_PX_PER_MM));
  const height = Math.min(220, Math.max(90, dims.h * 1000 * HEIGHT_PX_PER_MM));
  const bg = parcel ? "#c4935c" : spineColor(shape, item.name);
  const ink = isLight(bg) ? "#1c1b19" : "#f4f2ec";
  const label = item.type === "series" && item.attributes.season ? `${item.name}  T${item.attributes.season}` : item.name;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center overflow-hidden rounded-t-[2px] pt-1.5 pb-1 shadow-[inset_-2px_0_0_rgb(0_0_0/22%),inset_1px_0_0_rgb(255_255_255/12%)] transition-transform duration-150 group-hover/spine:-translate-y-1.5",
        selected && "-translate-y-2 ring-3 ring-marker",
      )}
      style={{ width, height, background: bg, color: ink } as CSSProperties}
    >
      {!parcel && <Sticker type={item.type} className="size-2.5 shrink-0" />}
      <span
        className={cn(
          "mt-1.5 min-h-0 flex-1 overflow-hidden text-[0.6875rem] font-bold tracking-wide text-ellipsis whitespace-nowrap uppercase [writing-mode:vertical-rl] rotate-180",
          parcel && "font-marker text-sm normal-case",
        )}
      >
        {label}
      </span>
      {striking && <Strike />}
    </div>
  );
}

/** Lo que tienen en común todas las formas: se abre con click y se arrastra a otro contenedor. */
function SortableShell({
  item,
  onOpen,
  sortable,
  className,
  children,
}: {
  item: VaultItem;
  onOpen: (item: VaultItem) => void;
  sortable: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Con un orden por criterio (nombre, año…) no se reordena a mano, pero se sigue pudiendo
  // arrastrar a otro contenedor del riel: el objeto se arrastra; lo que no recibe es el reorden.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: { draggable: false, droppable: !sortable },
  });
  const { t } = useI18n();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation list-none", isDragging && "opacity-30", className)}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full cursor-pointer rounded-[3px] text-left outline-none focus-visible:ring-3 focus-visible:ring-marker active:cursor-grabbing"
        aria-label={t.grid.cardAria(item.name)}
        {...attributes}
        {...listeners}
      >
        {children}
      </button>
    </li>
  );
}

/** Un objeto de la grilla, en la forma que pida la vista. */
export function ItemCard({
  item,
  onOpen,
  striking,
  selected,
  sortable = true,
  caption,
  density = "covers",
}: {
  item: VaultItem;
  onOpen: (item: VaultItem) => void;
  striking: boolean;
  selected: boolean;
  sortable?: boolean;
  caption?: string;
  density?: Density;
}) {
  return (
    <SortableShell item={item} onOpen={onOpen} sortable={sortable} className={density === "spines" ? "group/spine" : undefined}>
      {density === "list" ? (
        <ItemRowBody item={item} striking={striking} selected={selected} caption={caption} />
      ) : density === "spines" ? (
        <SpineBody item={item} striking={striking} selected={selected} />
      ) : (
        <ItemCardBody item={item} striking={striking} selected={selected} caption={caption} small={density === "small"} />
      )}
    </SortableShell>
  );
}
