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
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteItem, moveItem, placeItem, reorderItems } from "@/lib/actions/items";
import { isItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { search } from "@/lib/search";
import { isSortKey, SORT_KEYS, SORTS, sortItems, type SortKey } from "@/lib/sort";
import { cn } from "@/lib/utils";
import { whereabouts, whereLabel } from "@/lib/where";
import { ContainerDialog, type ContainerDialogMode } from "./ContainerDialog";
import { ContainerRail, DROP_PREFIX } from "./ContainerRail";
import { ItemCard, ItemCardBody } from "./ItemCard";
import { ItemDialog, type ItemDialogMode } from "./ItemDialog";
import { ItemPanel } from "./ItemPanel";
import { Sticker } from "./Sticker";

// El 3D se baja aparte y sólo en el browser: la búsqueda y la grilla no lo esperan.
const VaultScene = dynamic(() => import("@/components/vault3d/VaultScene"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center text-sm text-muted-foreground">
      <span className="tape -rotate-2 px-3 py-1 text-base">Armando los muebles…</span>
    </div>
  ),
});

export type View = "mueble" | "grilla";

export interface Filters {
  q: string;
  type: string;
  shelf: string;
  view: View | null;
  sort: string;
}

interface Props {
  items: VaultItem[];
  shelves: VaultShelf[];
  unshelved: number;
  filters: Filters;
  tmdbEnabled: boolean;
  userName: string;
  logout: React.ReactNode;
}

/* La vista preferida queda en el browser (no es un dato de la colección). Sin preferencia: el
 * mueble en pantallas anchas y la grilla en el celular, donde lo primero es "¿lo tengo?". */
const VIEW_KEY = "vault:view";
function subscribeView(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("vault:view", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("vault:view", cb);
  };
}
function readView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "mueble" || saved === "grilla") return saved;
  } catch {}
  return window.matchMedia("(min-width: 768px)").matches ? "mueble" : "grilla";
}
function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
  window.dispatchEvent(new Event("vault:view"));
}

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args).find((c) => String(c.id).startsWith(DROP_PREFIX));
  if (hit) return [hit];
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith(DROP_PREFIX)) });
};

export function VaultApp({ items: serverItems, shelves, unshelved, filters, tmdbEnabled, userName, logout }: Props) {
  // Copia local para que mover y ordenar se vean al instante; se pisa con lo que manda el server
  // después de cada acción (`revalidatePath`), y si una acción falla se vuelve atrás.
  const [items, setItems] = useState(serverItems);
  const [prevServer, setPrevServer] = useState(serverItems);
  if (serverItems !== prevServer) {
    setPrevServer(serverItems);
    setItems(serverItems);
  }

  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia("(max-width: 767px)").matches, () => false);
  const storedView = useSyncExternalStore(subscribeView, readView, () => "grilla" as View);
  const [urlView, setUrlView] = useState<View | null>(filters.view);
  const view = urlView ?? storedView;
  const [q, setQ] = useState(filters.q);
  const [type, setType] = useState(isItemType(filters.type) ? filters.type : "all");
  const [focus, setFocus] = useState(filters.shelf);
  const [sort, setSort] = useState<SortKey>(isSortKey(filters.sort) ? filters.sort : "manual");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialogMode | null>(null);
  const [containerDialog, setContainerDialog] = useState<ContainerDialogMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
  const [gridDragId, setGridDragId] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());

  // La URL refleja lo que se está mirando (se puede compartir y sobrevive al refresh), sin
  // pedirle nada al server: buscar no espera la red.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type !== "all") params.set("tipo", type);
    if (focus !== "all") params.set("estante", focus);
    if (urlView) params.set("vista", urlView);
    if (sort !== "manual") params.set("orden", sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, type, focus, urlView, sort]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  // Lo que se está por borrar sigue a la vista (tachado) hasta que vence el deshacer.
  const visibleItems = items;

  /** Lo que coincide con la búsqueda y el filtro de tipo; `null` cuando no hay ninguno. */
  const matches = useMemo(() => {
    const ofType = type === "all" ? visibleItems : visibleItems.filter((i) => i.type === type);
    const found = search(ofType, q);
    if (!found && type === "all") return null;
    return new Set((found ?? ofType).map((i) => i.id));
  }, [q, type, visibleItems]);

  const hits = useMemo(() => {
    if (!matches) return null;
    const out = new Map<string | null, number>();
    for (const i of visibleItems) if (matches.has(i.id)) out.set(i.shelfId, (out.get(i.shelfId) ?? 0) + 1);
    return out;
  }, [matches, visibleItems]);

  const gridItems = useMemo(
    () =>
      sortItems(
        visibleItems.filter(
          (i) => (!matches || matches.has(i.id)) && (focus === "all" || (focus === "none" ? i.shelfId === null : i.shelfId === focus)),
        ),
        sort,
      ),
    [visibleItems, matches, focus, sort],
  );

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;
  const total = items.length;

  function pickView(next: View) {
    setUrlView(null);
    saveView(next);
  }

  /** Soltar un objeto en un lugar concreto (la vista 3D). */
  async function place(itemId: string, containerId: string | null, level: number, index: number) {
    const before = items;
    const moving = items.find((i) => i.id === itemId);
    if (!moving) return;
    const shelf = shelves.find((s) => s.id === containerId);
    const eff = (i: VaultItem) => {
      const s = shelves.find((x) => x.id === i.shelfId);
      return s ? Math.min(i.level, s.levels - 1) : 0;
    };
    const rest = items.filter((i) => i.id !== itemId);
    const neighbours = rest.filter((i) => i.shelfId === containerId && eff(i) === level);
    const insertAt =
      index < neighbours.length
        ? rest.indexOf(neighbours[index])
        : neighbours.length
          ? rest.indexOf(neighbours[neighbours.length - 1]) + 1
          : Math.min(items.indexOf(moving), rest.length);
    const next = [...rest];
    next.splice(insertAt, 0, { ...moving, shelfId: containerId, level });
    setItems(next);
    const res = await placeItem(itemId, containerId, level, index);
    if (!res.ok) {
      setItems(before);
      toast.error(res.error);
      return;
    }
    const levelText = shelf && shelf.levels > 1 ? ` · estante ${level + 1}` : "";
    toast.success(`${moving.name} → ${shelf?.name ?? "Sin ubicar"}${levelText}`);
  }

  /** Sacar de la bóveda: se tacha con fibrón y queda 5 segundos para deshacer. */
  function requestDelete(item: VaultItem) {
    setSelectedId(null);
    setPendingDelete((s) => new Set(s).add(item.id));
    const undo = () => {
      window.clearTimeout(timers.current.get(item.id));
      timers.current.delete(item.id);
      setPendingDelete((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    };
    toast(`${item.name} sale de la bóveda`, { action: { label: "Deshacer", onClick: undo }, duration: 5000 });
    const timer = window.setTimeout(async () => {
      timers.current.delete(item.id);
      const res = await deleteItem(item.id);
      setPendingDelete((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      if (!res.ok) toast.error(res.error);
      else setItems((curr) => curr.filter((i) => i.id !== item.id));
    }, 5000);
    timers.current.set(item.id, timer);
  }

  /**
   * Acomodar un contenedor con el orden elegido: es como ordenar el estante a mano, así que cambia
   * el orden guardado (cada estante queda ordenado; nada cambia de estante).
   */
  async function arrange(containerId: string | null) {
    const inside = items.filter((i) => i.shelfId === containerId);
    if (inside.length < 2 || sort === "manual") return;
    const sorted = sortItems(inside, sort);
    const before = items;
    const ids = new Set(sorted.map((i) => i.id));
    const queue = [...sorted];
    setItems(items.map((i) => (ids.has(i.id) ? queue.shift()! : i)));
    const res = await reorderItems(sorted.map((i) => i.id));
    const name = containerId ? shelves.find((s) => s.id === containerId)?.name : "Sin ubicar";
    if (!res.ok) {
      setItems(before);
      toast.error(res.error);
    } else toast.success(`${name} quedó ordenado por ${SORTS[sort].toLowerCase()}`);
  }

  /* ---------------------------------------------------------- grilla: dnd-kit */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  async function onGridDragEnd({ active, over }: DragEndEvent) {
    setGridDragId(null);
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const before = items;
    if (overId.startsWith(DROP_PREFIX)) {
      const key = overId.slice(DROP_PREFIX.length);
      const target = key === "none" ? null : key;
      const item = items.find((i) => i.id === id);
      if (!item || item.shelfId === target) return;
      setItems((curr) => [{ ...item, shelfId: target, level: 0 }, ...curr.filter((i) => i.id !== id)]);
      const res = await moveItem(id, target);
      if (!res.ok) {
        setItems(before);
        toast.error(res.error);
      } else toast.success(`${item.name} → ${shelves.find((s) => s.id === target)?.name ?? "Sin ubicar"}`);
      return;
    }
    if (id === overId) return;
    const from = gridItems.findIndex((i) => i.id === id);
    const to = gridItems.findIndex((i) => i.id === overId);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(gridItems, from, to);
    // Lo que no se ve en la grilla filtrada conserva su lugar en la colección.
    const visible = new Set(reordered.map((i) => i.id));
    const queue = [...reordered];
    setItems(items.map((i) => (visible.has(i.id) ? queue.shift()! : i)));
    const res = await reorderItems(reordered.map((i) => i.id));
    if (!res.ok) {
      setItems(before);
      toast.error(res.error);
    }
  }

  const gridDragItem = gridDragId ? items.find((i) => i.id === gridDragId) ?? null : null;
  const createShelfId = focus !== "all" && focus !== "none" ? focus : null;
  const matchList = matches && view === "mueble" ? items.filter((i) => matches.has(i.id)) : [];

  return (
    <DndContext
      id="vault-dnd"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setGridDragId(String(e.active.id))}
      onDragEnd={onGridDragEnd}
      onDragCancel={() => setGridDragId(null)}
      accessibility={{
        screenReaderInstructions: { draggable: "Para levantar un objeto, apretá espacio. Movelo con las flechas y soltalo con espacio. Escape cancela." },
      }}
    >
      <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0">
        <TopBar
          q={q}
          narrow={narrow}
          onQuery={setQ}
          view={view}
          onView={pickView}
          onAdd={() => setItemDialog({ kind: "create", type: isItemType(type) ? type : undefined, shelfId: createShelfId })}
          userName={userName}
          logout={logout}
          matchCount={matches && q.trim() ? matches.size : null}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[16.5rem_minmax(0,1fr)]">
          <aside className="min-w-0 border-border px-4 pt-4 pb-2 md:overflow-y-auto md:border-r md:bg-paper md:px-3 md:pt-5">
            <ContainerRail
              shelves={shelves}
              unshelved={unshelved}
              total={total}
              current={focus}
              hits={hits}
              dragging={gridDragId !== null}
              onPick={(s) => {
                setFocus(s);
                setSelectedId(null);
              }}
              onEdit={(s) => setContainerDialog({ kind: "edit", shelf: s })}
              onCreate={() => setContainerDialog({ kind: "create" })}
              type={type}
              onType={setType}
            />
          </aside>

          <main className="relative min-h-0 min-w-0">
            {view === "mueble" ? (
              <div className="relative h-[68dvh] md:h-full">
                <VaultScene
                  shelves={shelves}
                  items={visibleItems}
                  matches={matches}
                  selectedId={selectedId}
                  focusContainer={focus === "none" ? null : focus}
                  pendingDelete={pendingDelete}
                  onSelect={setSelectedId}
                  onSelectContainer={(id) => setFocus(id ?? "none")}
                  onPlace={place}
                />
                {matchList.length > 0 && !selected && (
                  <MatchStrip items={matchList} all={items} shelves={shelves} selectedId={selectedId} onPick={setSelectedId} />
                )}
                {matches && matchList.length === 0 && <NoMatch q={q} onClear={() => (setQ(""), setType("all"))} />}
                {total === 0 && <EmptyVault onAdd={() => setItemDialog({ kind: "create", shelfId: null })} onContainer={() => setContainerDialog({ kind: "create" })} />}
                <ArrangeControl
                  sort={sort}
                  onSort={setSort}
                  target={focus === "all" ? undefined : focus === "none" ? null : focus}
                  targetName={focus === "none" ? "Sin ubicar" : shelves.find((s) => s.id === focus)?.name}
                  onArrange={arrange}
                />
                <p className="pointer-events-none absolute bottom-3 left-4 hidden text-xs text-muted-foreground md:block">
                  Tocá un lomo para sacarlo · arrastralo a otro estante o caja · arrastrá el fondo para mirar alrededor
                </p>
              </div>
            ) : (
              <GridView
                items={gridItems}
                total={total}
                filtering={Boolean(matches)}
                pendingDelete={pendingDelete}
                selectedId={selectedId}
                onOpen={(i) => setSelectedId(i.id === selectedId ? null : i.id)}
                onAdd={() => setItemDialog({ kind: "create", shelfId: createShelfId })}
                onContainer={() => setContainerDialog({ kind: "create" })}
                onClear={() => (setQ(""), setType("all"), setFocus("all"))}
                q={q}
                sort={sort}
                onSort={setSort}
                title={focus === "all" ? "Toda la casa" : focus === "none" ? "Sin ubicar" : shelves.find((s) => s.id === focus)?.name ?? "Contenedor"}
              />
            )}

            {selected && (
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:absolute md:inset-x-auto md:top-4 md:right-4 md:bottom-auto">
                <ItemPanel
                  item={selected}
                  where={whereabouts(selected, items, shelves)}
                  onClose={() => setSelectedId(null)}
                  onEdit={() => setItemDialog({ kind: "edit", item: selected })}
                  onDelete={() => requestDelete(selected)}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {gridDragItem && (
          <div className="w-36 rotate-2 cursor-grabbing">
            <ItemCardBody item={gridDragItem} lifted />
          </div>
        )}
      </DragOverlay>

      <ItemDialog mode={itemDialog} shelves={shelves} tmdbEnabled={tmdbEnabled} onClose={() => setItemDialog(null)} />
      <ContainerDialog
        mode={containerDialog}
        onClose={() => setContainerDialog(null)}
        onDeleted={(id) => {
          if (focus === id) setFocus("all");
        }}
      />
    </DndContext>
  );
}

/* -------------------------------------------------------------------- barra */

function TopBar({
  q,
  narrow,
  onQuery,
  view,
  onView,
  onAdd,
  userName,
  logout,
  matchCount,
}: {
  q: string;
  narrow: boolean;
  onQuery: (q: string) => void;
  view: View;
  onView: (v: View) => void;
  onAdd: () => void;
  userName: string;
  logout: React.ReactNode;
  matchCount: number | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-kraft-dark bg-kraft">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 md:h-16 md:flex-nowrap md:px-5 md:py-0">
        <h1 className="order-1">
          <span className="sr-only">The Vault</span>
          <span aria-hidden>
            <LogoTape />
          </span>
        </h1>

        <label className="relative order-3 w-full md:order-2 md:w-auto md:flex-1">
          <span className="sr-only">Buscar en la colección</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-marker/70" />
          <input
            type="search"
            spellCheck={false}
            autoComplete="off"
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={narrow ? "¿Lo tengo?" : "¿Lo tengo? Buscá un título, una temporada, un director…"}
            className="h-11 w-full rounded-md border-2 border-marker bg-card pr-24 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-marker/30 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {matchCount !== null && (
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", matchCount ? "bg-marker-red text-white" : "bg-muted text-muted-foreground")} aria-live="polite">
                {matchCount === 0 ? "No lo tenés" : matchCount === 1 ? "1 lo tenés" : `${matchCount} coinciden`}
              </span>
            )}
            {q && (
              <button type="button" onClick={() => onQuery("")} aria-label="Borrar búsqueda" className="grid size-7 place-items-center rounded text-marker/60 hover:text-marker">
                <X className="size-4" />
              </button>
            )}
          </span>
        </label>

        <div role="tablist" aria-label="Vista" className="order-4 flex h-11 md:order-3 overflow-hidden rounded-md border-2 border-marker text-sm font-semibold">
          {(["mueble", "grilla"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={cn("px-3.5 transition-colors", view === v ? "bg-marker text-white" : "bg-card/50 text-marker hover:bg-card")}
            >
              {v === "mueble" ? "Mueble" : "Grilla"}
            </button>
          ))}
        </div>

        <Button onClick={onAdd} className="order-5 h-11 rounded-md px-4 text-sm md:order-4">
          <Plus />
          Agregar
        </Button>

        {/* Una sola vez: en el celular sube al lado del logo con order, en desktop queda al final. */}
        <div className="order-2 ml-auto flex items-center gap-2 md:order-6 md:ml-0">
          <span className="hidden text-sm text-marker/80 md:inline">{userName}</span>
          {logout}
        </div>
      </div>
    </header>
  );
}

function LogoTape() {
  return <span className="tape inline-block -rotate-2 px-3.5 py-0.5 text-xl leading-tight tracking-wide whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/18%)]">THE VAULT</span>;
}

/* ------------------------------------------------------------- vista 3D: extras */

/** Las coincidencias en texto, al instante, aunque el 3D todavía se esté armando. */
function MatchStrip({ items, all, shelves, selectedId, onPick }: { items: VaultItem[]; all: VaultItem[]; shelves: VaultShelf[]; selectedId: string | null; onPick: (id: string) => void }) {
  return (
    <div className="absolute top-3 left-3 z-10 max-h-[30%] md:max-h-[45%] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-lg bg-card/95 p-1.5 shadow-[0_10px_30px_-12px_rgb(28_27_25/55%)] backdrop-blur-sm">
      <ul>
        {items.slice(0, 30).map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onPick(i.id)}
              className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted", selectedId === i.id && "bg-tape")}
            >
              <Sticker type={i.type} className="size-2.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {i.name}
                  {i.type === "series" && i.attributes.season ? ` · T${i.attributes.season}` : ""}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{whereLabel(whereabouts(i, all, shelves))}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <div className="absolute top-3 left-3 z-10 rounded-lg bg-card p-4 shadow-[0_10px_30px_-12px_rgb(28_27_25/55%)]">
      <p className="font-semibold">{q ? `No tenés nada que se llame "${q}"` : "No hay nada de este tipo"}</p>
      <button type="button" onClick={onClear} className="mt-1 text-sm underline underline-offset-4">
        Ver todo
      </button>
    </div>
  );
}

function EmptyVault({ onAdd, onContainer }: { onAdd: () => void; onContainer: () => void }) {
  return (
    <div className="absolute inset-x-4 top-6 z-10 mx-auto max-w-md rounded-lg bg-card p-6 text-center shadow-[0_14px_40px_-16px_rgb(28_27_25/55%)]">
      <p className="text-lg font-bold">La casa está vacía</p>
      <p className="mt-1 text-sm text-muted-foreground">Primero contale qué muebles y cajas tenés; después cargá lo que hay en cada uno.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={onContainer}>
          Nuevo contenedor
        </Button>
        <Button onClick={onAdd}>
          <Plus />
          Agregar algo
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- grilla */

function GridView({
  items,
  total,
  filtering,
  pendingDelete,
  selectedId,
  onOpen,
  onAdd,
  onContainer,
  onClear,
  q,
  sort,
  onSort,
  title,
}: {
  items: VaultItem[];
  total: number;
  filtering: boolean;
  pendingDelete: Set<string>;
  selectedId: string | null;
  onOpen: (i: VaultItem) => void;
  onAdd: () => void;
  onContainer: () => void;
  onClear: () => void;
  q: string;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  title: string;
}) {
  const manual = sort === "manual";
  return (
    <section aria-label={title} className="px-4 pt-4 pb-40 md:h-full md:overflow-y-auto md:px-6 md:pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold tracking-tight">
          {title} <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{items.length === 1 ? "1 objeto" : `${items.length} objetos`}</span>
        </h2>
        <SortSelect sort={sort} onSort={onSort} />
      </div>
      {items.length === 0 ? (
        total === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-marker/25 px-6 py-16 text-center">
            <p className="text-lg font-bold">La casa está vacía</p>
            <p className="mt-1 text-sm text-muted-foreground">Contale qué muebles y cajas tenés, y cargá lo que hay en cada uno.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={onContainer}>
                Nuevo contenedor
              </Button>
              <Button onClick={onAdd}>
                <Plus />
                Agregar algo
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-marker/25 px-6 py-14 text-center">
            <p className="font-semibold">{filtering ? (q ? `No tenés nada que se llame "${q}"` : "No hay nada de este tipo acá") : "Acá no hay nada todavía"}</p>
            <button type="button" onClick={onClear} className="mt-1 text-sm underline underline-offset-4">
              Ver toda la casa
            </button>
          </div>
        )
      ) : (
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} onOpen={onOpen} striking={pendingDelete.has(item.id)} selected={selectedId === item.id} sortable={manual} caption={captionFor(item, sort)} />
            ))}
          </ul>
        </SortableContext>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        {manual
          ? "Arrastrá una tapa sobre un contenedor para guardarla ahí, o entre las demás para cambiarle el orden."
          : `Ordenado por ${SORTS[sort].toLowerCase()}. Para acomodar a mano, volvé a "${SORTS.manual}".`}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------- orden */

function captionFor(item: VaultItem, sort: SortKey): string | undefined {
  if (sort === "genre") return item.attributes.genre || "Sin género";
  if (sort === "year") return item.attributes.year || "Sin año";
  return undefined;
}

function SortSelect({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Ordenar por</span>
      <span className="w-36">
        <NativeSelect value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="h-8 bg-card">
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {SORTS[k]}
            </option>
          ))}
        </NativeSelect>
      </span>
    </label>
  );
}

/**
 * En el mueble el orden no se "mira": se aplica. Con un contenedor elegido y un orden distinto del
 * propio, ofrece acomodarlo así, como se ordena un estante a mano.
 */
function ArrangeControl({
  sort,
  onSort,
  target,
  targetName,
  onArrange,
}: {
  sort: SortKey;
  onSort: (s: SortKey) => void;
  target: string | null | undefined;
  targetName: string | undefined;
  onArrange: (id: string | null) => void;
}) {
  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-card/95 p-2 shadow-[0_10px_30px_-12px_rgb(28_27_25/55%)]">
      <SortSelect sort={sort} onSort={onSort} />
      {sort !== "manual" &&
        (target === undefined ? (
          <span className="text-xs text-muted-foreground">Elegí un contenedor para acomodarlo</span>
        ) : (
          <Button size="sm" onClick={() => onArrange(target)}>
            Acomodar {targetName} así
          </Button>
        ))}
    </div>
  );
}
