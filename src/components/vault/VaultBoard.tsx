"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Loader2, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moveItem, reorderItems } from "@/lib/actions/items";
import { isItemType, ITEM_TYPE_KEYS, ITEM_TYPES } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ItemCard, ItemCardBody } from "./ItemCard";
import { ItemDialog, type ItemDialogMode } from "./ItemDialog";
import { ShelfDialog } from "./ShelfDialog";
import { SHELF_DROP_PREFIX, ShelfNav } from "./ShelfNav";
import { TypeIcon } from "./TypeIcon";

export interface Filters {
  q: string;
  type: string;
  shelf: string;
}

interface Props {
  items: VaultItem[];
  shelves: VaultShelf[];
  unshelved: number;
  total: number;
  filters: Filters;
  tmdbEnabled: boolean;
}

/**
 * Si el puntero está sobre un estante, el destino es el estante (mover). Si no, el objeto más
 * cercano de la grilla (reordenar). Sin esto, `closestCenter` elegiría siempre alguna tarjeta y
 * soltar sobre la barra lateral no movería nada.
 */
const collision: CollisionDetection = (args) => {
  const shelfHit = pointerWithin(args).find((c) => String(c.id).startsWith(SHELF_DROP_PREFIX));
  if (shelfHit) return [shelfHit];
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith(SHELF_DROP_PREFIX)),
  });
};

function buildHref(pathname: string, filters: Filters, patch: Partial<Filters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.type && next.type !== "all") params.set("tipo", next.type);
  if (next.shelf && next.shelf !== "all") params.set("estante", next.shelf);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function VaultBoard({ items: serverItems, shelves, unshelved, total, filters, tmdbEnabled }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Copia local para que arrastrar se vea al instante. Cuando el server manda datos nuevos
  // (después de cada acción, por `revalidatePath`), la copia se pisa con lo que hay en la base.
  const [items, setItems] = useState(serverItems);
  const [prevServerItems, setPrevServerItems] = useState(serverItems);
  if (serverItems !== prevServerItems) {
    setPrevServerItems(serverItems);
    setItems(serverItems);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ItemDialogMode | null>(null);
  const [editingShelf, setEditingShelf] = useState<VaultShelf | null>(null);

  const sensors = useSensors(
    // Con un mínimo de recorrido, un click abre el detalle y un arrastre mueve.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // En el celular hay que mantener apretado: si no, deslizar la página arrastraría tapas.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter queda para abrir el detalle; se levanta con espacio.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;
  const hrefFor = (shelf: string) => buildHref(pathname, filters, { shelf });

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const itemId = String(active.id);
    const overId = String(over.id);
    const before = items;

    if (overId.startsWith(SHELF_DROP_PREFIX)) {
      const key = overId.slice(SHELF_DROP_PREFIX.length);
      const target = key === "none" ? null : key;
      const item = items.find((i) => i.id === itemId);
      if (!item || item.shelfId === target) return;
      const stillVisible = filters.shelf === "all" || (filters.shelf === "none" ? target === null : filters.shelf === target);
      setItems((curr) => {
        const rest = curr.filter((i) => i.id !== itemId);
        return stillVisible ? [{ ...item, shelfId: target }, ...rest] : rest;
      });
      const res = await moveItem(itemId, target);
      if (!res.ok) {
        setItems(before);
        toast.error(res.error);
        return;
      }
      const shelfName = target ? shelves.find((s) => s.id === target)?.name : "Sin ubicar";
      toast.success(`${item.name} → ${shelfName}`);
      return;
    }

    if (itemId === overId) return;
    const from = items.findIndex((i) => i.id === itemId);
    const to = items.findIndex((i) => i.id === overId);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    const res = await reorderItems(next.map((i) => i.id));
    if (!res.ok) {
      setItems(before);
      toast.error(res.error);
    }
  }

  const shelfLabel =
    filters.shelf === "all" ? "Toda la colección" : filters.shelf === "none" ? "Sin ubicar" : shelves.find((s) => s.id === filters.shelf)?.name ?? "Estante";
  const filtering = Boolean(filters.q) || (filters.type !== "all" && isItemType(filters.type));

  return (
    <DndContext
      // Sin id fijo, dnd-kit numera su `aria-describedby` con un contador global que no coincide
      // entre el server y el browser, y React avisa un hydration mismatch.
      id="vault-dnd"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Para levantar un objeto, apretá espacio. Movelo con las flechas y soltalo con espacio. Escape cancela.",
        },
      }}
    >
      {/* `minmax(0,1fr)`: sin eso, en el celular la fila de estantes (que se desliza) estira la
          columna y toda la página scrollea de costado. */}
      <div className="mx-auto grid max-w-[110rem] grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-16 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8 md:px-6">
        <aside className="min-w-0 md:sticky md:top-20 md:self-start">
          <ShelfNav
            shelves={shelves}
            unshelved={unshelved}
            total={total}
            current={filters.shelf}
            hrefFor={hrefFor}
            dragging={activeId !== null}
            onEdit={setEditingShelf}
          />
          <p className="mt-4 hidden px-3 text-xs leading-relaxed text-muted-foreground md:block">
            Arrastrá una tapa sobre un estante para guardarla ahí, o entre las demás para cambiarle el orden.
          </p>
        </aside>

        <section aria-label={shelfLabel} className="min-w-0">
          <Toolbar filters={filters} pathname={pathname} onAdd={() => setDialog({ kind: "create", type: isItemType(filters.type) ? filters.type : undefined, shelfId: filters.shelf !== "all" && filters.shelf !== "none" ? filters.shelf : null })} />

          <div className="mt-5 mb-4 flex items-baseline justify-between gap-4">
            <h1 className="font-display text-2xl font-bold tracking-tight">{shelfLabel}</h1>
            <span className="text-sm text-muted-foreground tabular-nums">
              {items.length === 1 ? "1 objeto" : `${items.length} objetos`}
            </span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              filtering={filtering}
              emptyVault={total === 0}
              query={filters.q}
              onAdd={() => setDialog({ kind: "create", shelfId: filters.shelf !== "all" && filters.shelf !== "none" ? filters.shelf : null })}
              clearHref={buildHref(pathname, filters, { q: "", type: "all" })}
            />
          ) : (
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:gap-x-5">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} onOpen={(i) => setDialog({ kind: "view", item: i })} />
                ))}
              </ul>
            </SortableContext>
          )}
        </section>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeItem && (
          <div className="w-40 rotate-2 scale-105 cursor-grabbing">
            <ItemCardBody item={activeItem} lifted />
          </div>
        )}
      </DragOverlay>

      <ItemDialog
        mode={dialog}
        shelves={shelves}
        tmdbEnabled={tmdbEnabled}
        onChange={setDialog}
        onDeleted={(id) => setItems((curr) => curr.filter((i) => i.id !== id))}
      />
      <ShelfDialog
        shelf={editingShelf}
        onClose={() => setEditingShelf(null)}
        onDeleted={(id) => {
          if (filters.shelf === id) router.replace(hrefFor("all"), { scroll: false });
        }}
      />
    </DndContext>
  );
}

function Toolbar({ filters, pathname, onAdd }: { filters: Filters; pathname: string; onAdd: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La búsqueda va en la URL (se puede compartir y sobrevive al refresh), con un respiro entre teclas.
  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(() => router.replace(buildHref(pathname, filters, { q: value.trim() }), { scroll: false }));
    }, 280);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const activeType = isItemType(filters.type) ? filters.type : "all";

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {pending ? (
            <Loader2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar por nombre, temporada, director, marca…"
            aria-label="Buscar en la colección"
            className="h-10 rounded-xl pl-9 text-base md:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button onClick={onAdd} className="h-10 rounded-xl px-4">
          <Plus />
          <span className="hidden sm:inline">Agregar</span>
        </Button>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filtrar por tipo">
        <TypeChip href={buildHref(pathname, filters, { type: "all" })} active={activeType === "all"} label="Todo" />
        {ITEM_TYPE_KEYS.map((k) => (
          <TypeChip key={k} href={buildHref(pathname, filters, { type: k })} active={activeType === k} label={ITEM_TYPES[k].plural} type={k} />
        ))}
      </div>
    </div>
  );
}

function TypeChip({ href, active, label, type }: { href: string; active: boolean; label: string; type?: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-primary/60 bg-primary/15 text-foreground" : "text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {type && <TypeIcon type={type} className="size-3.5" />}
      {label}
    </Link>
  );
}

function EmptyState({
  filtering,
  emptyVault,
  query,
  onAdd,
  clearHref,
}: {
  filtering: boolean;
  emptyVault: boolean;
  query: string;
  onAdd: () => void;
  clearHref: string;
}) {
  if (filtering) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed px-6 py-16 text-center">
        <p className="font-medium">{query ? `Nada coincide con "${query}"` : "No hay nada de este tipo acá"}</p>
        <Link href={clearHref} scroll={false} className="mt-2 text-sm text-primary hover:underline">
          Ver todo
        </Link>
      </div>
    );
  }
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed px-6 py-20 text-center">
      <div className="mb-5 flex -space-x-6">
        {(["movie", "series", "book"] as const).map((t, i) => (
          <div
            key={t}
            className="grid h-24 w-16 place-items-center rounded-md border bg-card shadow-xl shadow-black/40"
            style={{ transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -6 : 0}px)` }}
          >
            <TypeIcon type={t} className="size-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
        ))}
      </div>
      <p className="font-display text-lg font-bold">{emptyVault ? "La bóveda está vacía" : "Este estante está vacío"}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {emptyVault
          ? "Empezá por tus DVDs: buscás el título, elegís la temporada y la tapa viene sola."
          : "Arrastrá tapas hasta acá desde la barra, o agregá algo nuevo."}
      </p>
      <Button onClick={onAdd} className="mt-5">
        <Plus />
        Agregar lo primero
      </Button>
    </div>
  );
}
