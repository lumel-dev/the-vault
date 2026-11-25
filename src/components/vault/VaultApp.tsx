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
import { CloudOff, CloudUpload, Plus, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { isItemType } from "@/lib/item-types";
import { applyOp } from "@/lib/offline/apply";
import { LAST, type Op } from "@/lib/offline/ops";
import { stickerFor } from "@/lib/stickers";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { search } from "@/lib/search";
import { isSortKey, SORT_KEYS, sortItems, type SortKey } from "@/lib/sort";
import { completeTranslations } from "@/lib/actions/items";
import { setLocaleAction } from "@/lib/actions/auth";
import { LOCALES, type Locale, type Messages } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { localize } from "@/lib/localized";
import { cn } from "@/lib/utils";
import { shelfSpots, whereabouts, whereLabel } from "@/lib/where";
import { ContainerDialog, type ContainerDialogMode } from "./ContainerDialog";
import { ContainerRail, DROP_PREFIX } from "./ContainerRail";
import { ContainerIcon } from "./ContainerIcon";
import { DENSITIES, isDensity, ItemCard, ItemCardBody, type Density } from "./ItemCard";
import { ItemDialog, type ItemDialogMode } from "./ItemDialog";
import { ItemPanel } from "./ItemPanel";
import { Sticker } from "./Sticker";
import { StickerDialog, type StickerDialogMode } from "./StickerDialog";
import { StickersProvider, useStickers, type StickerWithCount } from "./StickersContext";
import { useVaultStore, VaultStoreProvider, type SyncStatus } from "./VaultStore";

// El 3D se baja aparte y sólo en el browser: la búsqueda y la grilla no lo esperan.
const VaultScene = dynamic(() => import("@/components/vault3d/VaultScene"), {
  ssr: false,
  loading: () => <SceneLoading />,
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
  userId: string;
  /** Cuándo armó el server la colección (ms): decide si la guardada en el browser es más nueva. */
  renderedAt: number;
  items: VaultItem[];
  stickers: StickerWithCount[];
  shelves: VaultShelf[];
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

/* Lo mismo con la densidad de la grilla: tapas, tapas chicas, lista o lomos. */
const DENSITY_KEY = "vault:density";
function subscribeDensity(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("vault:density", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("vault:density", cb);
  };
}
function readDensity(): Density {
  try {
    const saved = localStorage.getItem(DENSITY_KEY);
    if (isDensity(saved)) return saved;
  } catch {}
  return "covers";
}
function saveDensity(density: Density) {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {}
  window.dispatchEvent(new Event("vault:density"));
}

/** Sin orden en la URL, la grilla va alfabética: es como se busca algo con la vista. */
const DEFAULT_SORT: SortKey = "name";

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

export function VaultApp({ userId, renderedAt, items: serverItems, stickers: serverStickers, shelves: serverShelves, filters, tmdbEnabled, userName, logout }: Props) {
  // La colección con los cambios que todavía no confirmó el server: todo se ve al instante, haya
  // señal o no, y cada cambio pasa por `mutate` (la cola de `src/lib/offline/`).
  const store = useVaultStore({ userId, renderedAt, items: serverItems, shelves: serverShelves, stickers: serverStickers });
  const { items, shelves, stickers, unshelved } = store.data;
  const { mutate } = store;
  const { locale, t } = useI18n();

  // Lo cargado desde TMDB antes de que la app fuera bilingüe se completa solo, de a tandas, en
  // segundo plano: cada tanda guarda los dos idiomas y el server manda la colección actualizada.
  const completing = useRef(false);
  const needsTranslations = serverItems.some((i) => i.externalSource === "tmdb" && Object.keys(i.translations ?? {}).length === 0);
  useEffect(() => {
    if (!needsTranslations || !tmdbEnabled || completing.current || !navigator.onLine) return;
    completing.current = true;
    void (async () => {
      try {
        for (let round = 0; round < 50; round++) {
          const res = await completeTranslations();
          if (!res.ok || res.data.remaining === 0 || res.data.done === 0) break;
        }
      } catch {
        // Sin señal: se completa la próxima vez que se abra con señal.
      }
      completing.current = false;
    })();
  }, [needsTranslations, tmdbEnabled]);

  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia("(max-width: 767px)").matches, () => false);
  const storedView = useSyncExternalStore(subscribeView, readView, () => "grilla" as View);
  const [urlView, setUrlView] = useState<View | null>(filters.view);
  const view = urlView ?? storedView;
  const [q, setQ] = useState(filters.q);
  // El filtro por sticker (su id). Un link viejo con un tipo ("?tipo=movie") elige el primero de ese tipo.
  const [type, setType] = useState(
    () => stickers.find((s) => s.id === filters.type)?.id ?? (isItemType(filters.type) ? stickers.find((s) => s.base === filters.type)?.id : undefined) ?? "all",
  );
  const [stickerDialog, setStickerDialog] = useState<StickerDialogMode | null>(null);
  const stickerRank = useMemo(() => {
    const order = new Map(stickers.map((s, i) => [s.id, i]));
    return (i: VaultItem) => order.get(stickerFor(i, stickers).id) ?? stickers.length;
  }, [stickers]);
  const [focus, setFocus] = useState(filters.shelf);
  const [sort, setSort] = useState<SortKey>(isSortKey(filters.sort) ? filters.sort : DEFAULT_SORT);
  const density = useSyncExternalStore(subscribeDensity, readDensity, () => "covers" as Density);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialogMode | null>(null);
  const [containerDialog, setContainerDialog] = useState<ContainerDialogMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
  const [gridDragId, setGridDragId] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());

  // Abierta sin señal, la página es la que guardó el service worker, con los filtros de cuando se
  // guardó: mandan los de la barra de direcciones. Va antes del efecto de abajo, que la reescribe.
  const readUrl = useEffectEvent(() => {
    const params = new URLSearchParams(window.location.search);
    const one = (k: string) => params.get(k) ?? "";
    if (one("q") !== filters.q) setQ(one("q").slice(0, 200));
    const tipo = one("tipo");
    const sticker = stickers.find((s) => s.id === tipo)?.id ?? (isItemType(tipo) ? stickers.find((s) => s.base === tipo)?.id : undefined);
    if (tipo !== filters.type) setType(sticker ?? "all");
    const estante = one("estante");
    if (estante !== filters.shelf) setFocus(estante === "none" || shelves.some((s) => s.id === estante) ? estante : "all");
    const vista = one("vista");
    if (vista !== (filters.view ?? "")) setUrlView(vista === "mueble" || vista === "grilla" ? vista : null);
    const orden = one("orden");
    if (orden !== filters.sort) setSort(isSortKey(orden) ? orden : DEFAULT_SORT);
  });
  // La URL es un sistema externo y sólo se lee al abrir: no hay forma de leerla al hidratar sin
  // que lo dibujado por el server y por el browser difieran.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => readUrl(), []);

  // La URL refleja lo que se está mirando (se puede compartir y sobrevive al refresh), sin
  // pedirle nada al server: buscar no espera la red.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type !== "all") params.set("tipo", type);
    if (focus !== "all") params.set("estante", focus);
    if (urlView) params.set("vista", urlView);
    if (sort !== DEFAULT_SORT) params.set("orden", sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, type, focus, urlView, sort]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  // Lo que se ve, en el idioma elegido (título, sinopsis, género y tapa). \`items\` queda con los
  // datos tal cual para mover y guardar. Lo que se está por borrar sigue a la vista, tachado.
  const visibleItems = useMemo(() => items.map((i) => localize(i, locale)), [items, locale]);

  /** Lo que coincide con la búsqueda y el filtro de tipo; `null` cuando no hay ninguno. */
  const matches = useMemo(() => {
    const ofType = type === "all" ? visibleItems : visibleItems.filter((i) => stickerFor(i, stickers).id === type);
    const found = search(ofType, q);
    if (!found && type === "all") return null;
    return new Set((found ?? ofType).map((i) => i.id));
  }, [q, type, visibleItems, stickers]);

  const hits = useMemo(() => {
    if (!matches) return null;
    const out = new Map<string | null, number>();
    for (const i of visibleItems) if (matches.has(i.id)) out.set(i.shelfId, (out.get(i.shelfId) ?? 0) + 1);
    return out;
  }, [matches, visibleItems]);

  /**
   * En "Toda la casa" la grilla va por contenedor, en el orden del riel y "Sin ubicar" al final, y
   * cada uno con el orden elegido. `gridItems` es la concatenación: el orden en que se ven.
   */
  const gridGroups = useMemo(() => {
    const shown = sortItems(
      visibleItems.filter(
        (i) => (!matches || matches.has(i.id)) && (focus === "all" || (focus === "none" ? i.shelfId === null : i.shelfId === focus)),
      ),
      sort,
      stickerRank,
    );
    if (focus !== "all") return [{ id: focus === "none" ? null : focus, items: shown }];
    const known = new Set(shelves.map((s) => s.id));
    const order: (string | null)[] = [...shelves.map((s) => s.id), null];
    return order
      .map((id) => ({ id, items: shown.filter((i) => (id === null ? !i.shelfId || !known.has(i.shelfId) : i.shelfId === id)) }))
      .filter((g) => g.items.length > 0);
  }, [visibleItems, matches, focus, sort, shelves, stickerRank]);
  const gridItems = useMemo(() => gridGroups.flatMap((g) => g.items), [gridGroups]);

  const selected = selectedId ? visibleItems.find((i) => i.id === selectedId) ?? null : null;
  const total = items.length;

  function pickView(next: View) {
    setUrlView(null);
    saveView(next);
  }

  /**
   * Soltar un objeto en un lugar concreto (la vista 3D): estante y lugar en ese estante. Se guarda
   * como el lugar dentro de todo el mueble; los estantes se vuelven a repartir solos.
   */
  function place(itemId: string, containerId: string | null, level: number, index: number) {
    const moving = items.find((i) => i.id === itemId);
    if (!moving) return;
    const shelf = shelves.find((s) => s.id === containerId) ?? null;
    const rest = items.filter((i) => i.id !== itemId);
    const inside = rest.filter((i) => (shelf ? i.shelfId === shelf.id : !shelves.some((s) => s.id === i.shelfId)));
    const spots = shelfSpots(shelf, inside);
    // Lo de los estantes de arriba va antes; después, el lugar dentro del estante.
    const flat = Math.min(inside.length, index + inside.filter((i) => (spots.get(i.id)?.level ?? 0) < level).length);
    const op: Op = { kind: "placeItem", id: itemId, shelfId: containerId, index: flat };
    if (!mutate(op)) return;
    const next = applyOp({ items, shelves, stickers }, op).items;
    const shownName = visibleItems.find((i) => i.id === itemId)?.name ?? moving.name;
    const w = whereabouts({ ...moving, shelfId: containerId }, next, shelves, t);
    toast.success(t.toast.moved(shownName, [w.container, w.level].filter(Boolean).join(" · ")));
  }

  /** Llevar algo a un contenedor (o a "Sin ubicar"): a un mueble llega al final; a "Sin ubicar", primero. */
  function moveTo(item: VaultItem, shelfId: string | null) {
    if (!mutate({ kind: "placeItem", id: item.id, shelfId, index: shelfId ? LAST : 0 })) return;
    toast.success(t.toast.moved(visibleItems.find((i) => i.id === item.id)?.name ?? item.name, shelves.find((s) => s.id === shelfId)?.name ?? t.where.unplaced));
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
    toast(t.toast.leaving(item.name), { action: { label: t.toast.undo, onClick: undo }, duration: 5000 });
    const timer = window.setTimeout(() => {
      timers.current.delete(item.id);
      mutate({ kind: "deleteItem", id: item.id });
      setPendingDelete((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }, 5000);
    timers.current.set(item.id, timer);
  }

  /**
   * Acomodar un contenedor con el orden elegido: es como ordenar el estante a mano, así que cambia
   * el orden guardado (cada estante queda ordenado; nada cambia de estante).
   */
  function arrange(containerId: string | null) {
    const inside = visibleItems.filter((i) => i.shelfId === containerId);
    if (inside.length < 2 || sort === "manual") return;
    const sorted = sortItems(inside, sort, stickerRank);
    if (!mutate({ kind: "reorderItems", ids: sorted.map((i) => i.id) })) return;
    const name = containerId ? shelves.find((s) => s.id === containerId)?.name : t.where.unplaced;
    toast.success(t.toast.arranged(name ?? "", t.sort[sort].toLowerCase()));
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

  function onGridDragEnd({ active, over }: DragEndEvent) {
    setGridDragId(null);
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith(DROP_PREFIX)) {
      const key = overId.slice(DROP_PREFIX.length);
      const target = key === "none" ? null : key;
      const item = items.find((i) => i.id === id);
      if (!item || item.shelfId === target) return;
      moveTo(item, target);
      return;
    }
    if (id === overId || sort !== "manual") return;
    const dragged = items.find((i) => i.id === id);
    const target = items.find((i) => i.id === overId);
    // Soltado sobre un objeto de otro contenedor (la grilla agrupada): va a ese contenedor.
    if (dragged && target && dragged.shelfId !== target.shelfId) {
      moveTo(dragged, target.shelfId);
      return;
    }
    const from = gridItems.findIndex((i) => i.id === id);
    const to = gridItems.findIndex((i) => i.id === overId);
    if (from < 0 || to < 0) return;
    // Lo que no se ve en la grilla filtrada conserva su lugar en la colección.
    mutate({ kind: "reorderItems", ids: arrayMove(gridItems, from, to).map((i) => i.id) });
  }

  const gridDragItem = gridDragId ? items.find((i) => i.id === gridDragId) ?? null : null;
  const createShelfId = focus !== "all" && focus !== "none" ? focus : null;
  const matchList = matches && view === "mueble" ? visibleItems.filter((i) => matches.has(i.id)) : [];

  return (
    <VaultStoreProvider store={store}>
    <StickersProvider stickers={stickers}>
    <DndContext
      id="vault-dnd"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setGridDragId(String(e.active.id))}
      onDragEnd={onGridDragEnd}
      onDragCancel={() => setGridDragId(null)}
      accessibility={{
        screenReaderInstructions: { draggable: t.grid.dragInstructions },
      }}
    >
      {/* `data-vault-shell`: el service worker guarda para abrir sin señal sólo la página que la trae. */}
      <div data-vault-shell="" className="flex min-h-dvh flex-col md:h-dvh md:min-h-0">
        <TopBar
          q={q}
          narrow={narrow}
          onQuery={setQ}
          view={view}
          onView={pickView}
          onAdd={() => setItemDialog({ kind: "create", stickerId: type !== "all" ? type : undefined, shelfId: createShelfId })}
          userName={userName}
          logout={logout}
          matchCount={matches && q.trim() ? matches.size : null}
          sync={store.status}
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
              onEditSticker={(s) => setStickerDialog({ kind: "edit", sticker: s })}
              onCreateSticker={() => setStickerDialog({ kind: "create" })}
            />
          </aside>

          <main className="relative min-h-0 min-w-0">
            {view === "mueble" ? (
              <div className="relative h-[68dvh] md:h-full">
                <VaultScene
                  shelves={shelves}
                  stickers={stickers}
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
                  <MatchStrip items={matchList} all={visibleItems} shelves={shelves} selectedId={selectedId} onPick={setSelectedId} />
                )}
                {matches && matchList.length === 0 && <NoMatch q={q} onClear={() => (setQ(""), setType("all"))} />}
                {total === 0 && <EmptyVault onAdd={() => setItemDialog({ kind: "create", shelfId: null })} onContainer={() => setContainerDialog({ kind: "create" })} />}
                <ArrangeControl
                  sort={sort}
                  onSort={setSort}
                  target={focus === "all" ? undefined : focus === "none" ? null : focus}
                  targetName={focus === "none" ? t.where.unplaced : shelves.find((s) => s.id === focus)?.name}
                  onArrange={arrange}
                />
                <p className="pointer-events-none absolute bottom-3 left-4 hidden text-xs text-muted-foreground md:block">{t.scene.hint}</p>
              </div>
            ) : (
              <GridView
                items={gridItems}
                groups={focus === "all" ? gridGroups : null}
                shelves={shelves}
                onFocus={setFocus}
                density={density}
                onDensity={saveDensity}
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
                title={focus === "all" ? t.rail.wholeHouse : focus === "none" ? t.rail.unplaced : shelves.find((s) => s.id === focus)?.name ?? t.rail.containers}
              />
            )}

            {selected && (
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:absolute md:inset-x-auto md:top-4 md:right-4 md:bottom-auto">
                <ItemPanel
                  item={selected}
                  collection={visibleItems}
                  where={whereabouts(selected, items, shelves, t)}
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

      <ItemDialog mode={itemDialog} items={items} shelves={shelves} tmdbEnabled={tmdbEnabled} onClose={() => setItemDialog(null)} />
      <ContainerDialog
        mode={containerDialog}
        onClose={() => setContainerDialog(null)}
        onDeleted={(id) => {
          if (focus === id) setFocus("all");
        }}
      />
      <StickerDialog
        mode={stickerDialog}
        onClose={() => setStickerDialog(null)}
        onDeleted={(id) => {
          if (type === id) setType("all");
        }}
      />
    </DndContext>
    </StickersProvider>
    </VaultStoreProvider>
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
  sync,
}: {
  sync: SyncStatus;
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
  const { t } = useI18n();
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
          <span className="sr-only">{t.top.searchLabel}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-marker/70" />
          <input
            type="search"
            spellCheck={false}
            autoComplete="off"
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={narrow ? t.top.searchPlaceholderShort : t.top.searchPlaceholder}
            className="h-11 w-full rounded-md border-2 border-marker bg-card pr-24 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-marker/30 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
            {matchCount !== null && (
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", matchCount ? "bg-marker-red text-white" : "bg-muted text-muted-foreground")} aria-live="polite">
                {matchCount === 0 ? t.top.noMatch : matchCount === 1 ? t.top.oneMatch : t.top.matches(matchCount)}
              </span>
            )}
            {q && (
              <button type="button" onClick={() => onQuery("")} aria-label={t.top.clearSearch} className="grid size-7 place-items-center rounded text-marker/60 hover:text-marker">
                <X className="size-4" />
              </button>
            )}
          </span>
        </label>

        <div role="tablist" aria-label={t.top.view} className="order-4 flex h-11 md:order-3 overflow-hidden rounded-md border-2 border-marker text-sm font-semibold">
          {(["mueble", "grilla"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => onView(v)}
              className={cn("px-3.5 transition-colors", view === v ? "bg-marker text-white" : "bg-card/50 text-marker hover:bg-card")}
            >
              {v === "mueble" ? t.top.viewShelves : t.top.viewGrid}
            </button>
          ))}
        </div>

        <Button onClick={onAdd} className="order-5 h-11 rounded-md px-4 text-sm md:order-4">
          <Plus />
          {t.top.add}
        </Button>

        {/* Una sola vez: en el celular sube al lado del logo con order, en desktop queda al final. */}
        <div className="order-2 ml-auto flex items-center gap-2 md:order-6 md:ml-0">
          <SyncBadge status={sync} />
          <span className="hidden text-sm text-marker/80 md:inline">{userName}</span>
          <LocaleSwitch />
          {logout}
        </div>
      </div>
    </header>
  );
}

/**
 * Sin señal o con cambios por subir, lo dice; con todo subido, no muestra nada. En el celular,
 * sólo el ícono (el texto queda de título y para el lector de pantalla).
 */
function SyncBadge({ status }: { status: SyncStatus }) {
  const { t } = useI18n();
  if (status.online && !status.pending && !status.sessionExpired) return null;
  const text = status.sessionExpired
    ? t.offline.session
    : !status.online
      ? status.pending
        ? `${t.offline.offline} · ${t.offline.pending(status.pending)}`
        : t.offline.offline
      : t.offline.pending(status.pending);
  const Icon = status.online && !status.sessionExpired ? CloudUpload : CloudOff;
  return (
    <span role="status" title={text} className="flex h-8 items-center gap-1.5 rounded-md bg-marker/10 px-2 text-xs font-semibold text-marker">
      <Icon className={cn("size-4 shrink-0", status.online && status.pending > 0 && "animate-pulse")} aria-hidden />
      <span className="sr-only md:not-sr-only">{text}</span>
    </span>
  );
}

function LogoTape() {
  return <span className="tape inline-block -rotate-2 px-3.5 py-0.5 text-xl leading-tight tracking-wide whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/18%)]">THE VAULT</span>;
}

/* ------------------------------------------------------------- vista 3D: extras */

/** Las coincidencias en texto, al instante, aunque el 3D todavía se esté armando. */
function MatchStrip({ items, all, shelves, selectedId, onPick }: { items: VaultItem[]; all: VaultItem[]; shelves: VaultShelf[]; selectedId: string | null; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const { of } = useStickers();
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
              <Sticker color={of(i).color} className="size-2.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {i.name}
                  {i.type === "series" && i.attributes.season ? ` · ${t.seasonShort(i.attributes.season)}` : ""}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{whereLabel(whereabouts(i, all, shelves, t))}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  const { t } = useI18n();
  return (
    <div className="absolute top-3 left-3 z-10 rounded-lg bg-card p-4 shadow-[0_10px_30px_-12px_rgb(28_27_25/55%)]">
      <p className="font-semibold">{q ? t.scene.noMatch(q) : t.scene.noMatchType}</p>
      <button type="button" onClick={onClear} className="mt-1 text-sm underline underline-offset-4">
        {t.common.seeAll}
      </button>
    </div>
  );
}

function EmptyVault({ onAdd, onContainer }: { onAdd: () => void; onContainer: () => void }) {
  const { t } = useI18n();
  return (
    <div className="absolute inset-x-4 top-6 z-10 mx-auto max-w-md rounded-lg bg-card p-6 text-center shadow-[0_14px_40px_-16px_rgb(28_27_25/55%)]">
      <p className="text-lg font-bold">{t.scene.emptyTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.scene.emptyBody}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={onContainer}>
          {t.rail.newContainer}
        </Button>
        <Button onClick={onAdd}>
          <Plus />
          {t.scene.addSomething}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- grilla */

function GridView({
  items,
  groups,
  shelves,
  onFocus,
  density,
  onDensity,
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
  /** Por contenedor ("Toda la casa"); `null` cuando se mira uno solo. */
  groups: { id: string | null; items: VaultItem[] }[] | null;
  shelves: VaultShelf[];
  onFocus: (id: string) => void;
  density: Density;
  onDensity: (d: Density) => void;
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
  const { t } = useI18n();
  return (
    <section aria-label={title} className="px-4 pt-4 pb-40 md:h-full md:overflow-y-auto md:px-6 md:pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold tracking-tight">
          {title} <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{t.grid.objects(items.length)}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DensitySwitch density={density} onDensity={onDensity} />
          <SortSelect sort={sort} onSort={onSort} />
        </div>
      </div>
      {items.length === 0 ? (
        total === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-marker/25 px-6 py-16 text-center">
            <p className="text-lg font-bold">{t.grid.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.grid.emptyBody}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={onContainer}>
                {t.rail.newContainer}
              </Button>
              <Button onClick={onAdd}>
                <Plus />
                {t.scene.addSomething}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-marker/25 px-6 py-14 text-center">
            <p className="font-semibold">{filtering ? (q ? t.scene.noMatch(q) : t.grid.nothingOfType) : t.grid.nothingHere}</p>
            <button type="button" onClick={onClear} className="mt-1 text-sm underline underline-offset-4">
              {t.grid.seeWholeHouse}
            </button>
          </div>
        )
      ) : (
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          {groups ? (
            <div className="grid gap-7">
              {groups.map((g) => {
                const shelf = g.id ? shelves.find((s) => s.id === g.id) : undefined;
                const name = shelf?.name ?? t.rail.unplaced;
                return (
                  <section key={g.id ?? "none"} aria-label={name}>
                    <h3 className="mb-3">
                      <button
                        type="button"
                        onClick={() => onFocus(g.id ?? "none")}
                        className="inline-flex items-center gap-2 text-left text-marker hover:opacity-80"
                      >
                        <ContainerIcon kind={shelf?.kind ?? null} className="size-4" />
                        <span className="tape -rotate-1 px-2.5 py-0.5 text-base">{name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
                      </button>
                    </h3>
                    <ItemList items={g.items} density={density} pendingDelete={pendingDelete} selectedId={selectedId} onOpen={onOpen} sort={sort} />
                  </section>
                );
              })}
            </div>
          ) : (
            <ItemList items={items} density={density} pendingDelete={pendingDelete} selectedId={selectedId} onOpen={onOpen} sort={sort} />
          )}
        </SortableContext>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        {manual ? t.grid.hintManual : t.grid.hintSorted(t.sort[sort].toLowerCase(), t.sort.manual)}
      </p>
    </section>
  );
}

const LIST_CLASS: Record<Density, string> = {
  covers: "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]",
  small: "grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-x-2.5 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))]",
  list: "grid gap-0.5 md:grid-cols-2 md:gap-x-6",
  // Los lomos, parados sobre una tabla: cada renglón que se arma al envolver es un estante.
  spines: "flex flex-wrap items-end gap-y-3 [&>li]:border-b-[6px] [&>li]:border-[#4a3c30]",
};

function ItemList({
  items,
  density,
  pendingDelete,
  selectedId,
  onOpen,
  sort,
}: {
  items: VaultItem[];
  density: Density;
  pendingDelete: Set<string>;
  selectedId: string | null;
  onOpen: (i: VaultItem) => void;
  sort: SortKey;
}) {
  const { t } = useI18n();
  return (
    <ul className={LIST_CLASS[density]}>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onOpen={onOpen}
          striking={pendingDelete.has(item.id)}
          selected={selectedId === item.id}
          sortable={sort === "manual"}
          caption={captionFor(item, sort, t)}
          density={density}
        />
      ))}
    </ul>
  );
}

function DensitySwitch({ density, onDensity }: { density: Density; onDensity: (d: Density) => void }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t.grid.density} className="flex h-8 overflow-hidden rounded-md border-2 border-marker text-xs font-semibold">
      {DENSITIES.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={density === d}
          onClick={() => onDensity(d)}
          className={cn("px-2.5 transition-colors", density === d ? "bg-marker text-white" : "bg-card/50 text-marker hover:bg-card")}
        >
          {t.grid.densities[d]}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- orden */

function captionFor(item: VaultItem, sort: SortKey, t: Messages): string | undefined {
  if (sort === "genre") return item.attributes.genre || t.grid.noGenre;
  if (sort === "year") return item.attributes.year || t.grid.noYear;
  return undefined;
}

function SortSelect({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  const { t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t.sort.label}</span>
      <span className="w-36">
        <NativeSelect value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="h-8 bg-card">
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {t.sort[k]}
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
  const { t } = useI18n();
  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-card/95 p-2 shadow-[0_10px_30px_-12px_rgb(28_27_25/55%)]">
      <SortSelect sort={sort} onSort={onSort} />
      {sort !== "manual" &&
        (target === undefined ? (
          <span className="text-xs text-muted-foreground">{t.scene.pickContainer}</span>
        ) : (
          <Button size="sm" onClick={() => onArrange(target)}>
            {t.scene.arrange(targetName ?? "")}
          </Button>
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------- idioma */

function SceneLoading() {
  const { t } = useI18n();
  return (
    <div className="grid size-full place-items-center text-sm text-muted-foreground">
      <span className="tape -rotate-2 px-3 py-1 text-base">{t.scene.loading}</span>
    </div>
  );
}

/**
 * ES / EN. Se guarda en la cuenta: cambia la interfaz y los títulos, sinopsis, géneros y tapas de lo
 * que vino de TMDB, sin volver a pedir nada (los dos idiomas ya están guardados).
 */
function LocaleSwitch() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label={t.locale.label} className={cn("flex h-9 overflow-hidden rounded-md border-2 border-marker text-xs font-bold", pending && "opacity-60")}>
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          title={t.locale[l]}
          disabled={pending}
          onClick={() =>
            locale !== l &&
            startTransition(async () => {
              // Cambiar el idioma lo guarda el server: sin señal, se avisa y queda el que estaba.
              try {
                await setLocaleAction(l);
              } catch {
                toast.error(t.offline.offline);
              }
            })
          }
          className={cn("px-2 uppercase transition-colors", locale === l ? "bg-marker text-white" : "bg-card/50 text-marker hover:bg-card")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
