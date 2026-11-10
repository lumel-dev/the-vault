"use client";

import { useDroppable } from "@dnd-kit/core";
import { Layers, Pencil, Plus } from "lucide-react";
import { ITEM_TYPE_KEYS } from "@/lib/item-types";
import type { VaultShelf } from "@/lib/queries";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ContainerIcon } from "./ContainerIcon";
import { Sticker } from "./Sticker";

export const DROP_PREFIX = "shelf:";

interface Props {
  shelves: VaultShelf[];
  unshelved: number;
  total: number;
  current: string;
  /** Contenedores donde hay algo que coincide con la búsqueda. */
  hits: Map<string | null, number> | null;
  dragging: boolean;
  onPick: (shelf: string) => void;
  onEdit: (shelf: VaultShelf) => void;
  onCreate: () => void;
  type: string;
  onType: (type: string) => void;
}

function Row({
  id,
  active,
  droppable,
  dragging,
  icon,
  label,
  count,
  hits,
  onPick,
  onEdit,
}: {
  id: string;
  active: boolean;
  droppable: boolean;
  dragging: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  hits?: number;
  onPick: () => void;
  onEdit?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_PREFIX + id, disabled: !droppable });
  const { t } = useI18n();
  return (
    <li ref={setNodeRef} className="group/row relative shrink-0">
      <button
        type="button"
        onClick={onPick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors md:pr-9",
          active ? "bg-card font-semibold shadow-[0_1px_3px_rgb(28_27_25/16%)]" : "text-foreground/80 hover:bg-card/60 hover:text-foreground",
          dragging && droppable && "border-dashed border-marker/30",
          isOver && "border-solid border-marker bg-tape text-marker",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
        <span className="ml-auto flex items-center gap-1.5 pl-2 text-xs tabular-nums">
          {hits ? (
            <span className="rounded-full bg-marker-red px-1.5 py-px font-semibold text-white" title={t.rail.hits(hits)}>
              {hits}
            </span>
          ) : null}
          <span className="text-muted-foreground">{count}</span>
        </span>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={t.rail.editContainer(label)}
          className="absolute top-1/2 right-1.5 hidden size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 md:grid"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * Los contenedores de la casa: elegirlos lleva la cámara (o filtra la grilla), y en la grilla
 * reciben lo que se suelta encima. En el celular es una fila que se desliza.
 */
export function ContainerRail({ shelves, unshelved, total, current, hits, dragging, onPick, onEdit, onCreate, type, onType }: Props) {
  const { t } = useI18n();
  return (
    <nav aria-label="Contenedores" className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div>
        <h2 className="mb-1.5 hidden px-2.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:block">{t.rail.containers}</h2>
        <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
          <Row
            id="all"
            active={current === "all"}
            droppable={false}
            dragging={dragging}
            icon={<Layers className="size-5 shrink-0" strokeWidth={1.75} />}
            label={t.rail.wholeHouse}
            count={total}
            onPick={() => onPick("all")}
          />
          {shelves.map((s) => (
            <Row
              key={s.id}
              id={s.id}
              active={current === s.id}
              droppable
              dragging={dragging}
              icon={<ContainerIcon kind={s.kind} />}
              label={s.name}
              count={s.count}
              hits={hits?.get(s.id)}
              onPick={() => onPick(s.id)}
              onEdit={() => onEdit(s)}
            />
          ))}
          <Row
            id="none"
            active={current === "none"}
            droppable
            dragging={dragging}
            icon={<ContainerIcon kind={null} />}
            label={t.rail.unplaced}
            count={unshelved}
            hits={hits?.get(null)}
            onPick={() => onPick("none")}
          />
          <li className="shrink-0 md:mt-1">
            <button
              type="button"
              onClick={onCreate}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
            >
              <Plus className="size-5" strokeWidth={1.75} />
              {t.rail.newContainer}
            </button>
          </li>
        </ul>
      </div>

      <div>
        <h2 className="mb-1.5 hidden px-2.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:block">{t.rail.stickers}</h2>
        <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-0 md:px-0" aria-label={t.rail.filterByType}>
          {ITEM_TYPE_KEYS.map((k) => {
            const active = type === k;
            return (
              <li key={k} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onType(active ? "all" : k)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors md:py-1",
                    active ? "bg-card font-semibold" : "text-foreground/75 hover:text-foreground",
                    "max-md:rounded-full max-md:border max-md:border-border max-md:px-3",
                  )}
                >
                  <Sticker type={k} />
                  {t.types[k].plural}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
