"use client";

import { Loader2, Search, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createItem, updateItem, type ItemInput } from "@/lib/actions/items";
import { searchCatalogAction } from "@/lib/actions/catalogs";
import { movieDetailsAction, searchTmdbAction, tvSeasonsAction } from "@/lib/actions/tmdb";
import type { CatalogResult } from "@/lib/catalogs";
import { inventoryLabel } from "@/lib/containers";
import { ITEM_TYPE_KEYS, ITEM_TYPES, typeDef, type ItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import type { TmdbResult, TmdbSeason } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { Cover } from "./Cover";

interface Props {
  item?: VaultItem;
  defaultType?: ItemType;
  defaultShelfId?: string | null;
  shelves: VaultShelf[];
  tmdbEnabled: boolean;
  onDone: () => void;
  onCancel: () => void;
}

interface CoverRef {
  source: string;
  ref: string;
}

export function ItemForm({ item, defaultType = "movie", defaultShelfId = null, shelves, tmdbEnabled, onDone, onCancel }: Props) {
  const editing = Boolean(item);
  const [type, setType] = useState<string>(item?.type ?? defaultType);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [model, setModel] = useState(item?.model ?? "");
  const [shelfId, setShelfId] = useState<string | null>(item ? item.shelfId : defaultShelfId);
  const [level, setLevel] = useState(item?.level ?? 0);
  const currentShelf = shelves.find((s) => s.id === shelfId) ?? null;
  // Lo nuevo arranca en DVD: es para lo que más se usa la app.
  const [attrs, setAttrs] = useState<Record<string, string>>(item?.attributes ?? { format: "DVD" });
  const [cover, setCover] = useState<CoverRef | null>(
    item?.coverSource && item.coverRef ? { source: item.coverSource, ref: item.coverRef } : null,
  );
  // De qué catálogo salió (TMDB, Open Library, MusicBrainz) y su id ahí.
  const [external, setExternal] = useState<{ source: string; id: string } | null>(
    item?.externalSource && item.externalId ? { source: item.externalSource, id: item.externalId } : null,
  );
  const [pending, startTransition] = useTransition();

  const def = typeDef(type);

  function setAttr(key: string, value: string) {
    setAttrs((a) => ({ ...a, [key]: value }));
  }

  const [round, setRound] = useState(0);

  /** Después de "Agregar y cargar otro": queda el lugar, el tipo y el formato; lo demás se limpia. */
  function resetForNext() {
    setName("");
    setDescription("");
    setBrand("");
    setModel("");
    setAttrs(attrs.format ? { format: attrs.format } : {});
    setCover(null);
    setExternal(null);
    setRound((r) => r + 1);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const again = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "again";
    const input: ItemInput = {
      type,
      name,
      description,
      brand: def.brandModel ? brand : null,
      model: def.brandModel ? model : null,
      shelfId,
      level: currentShelf ? Math.min(level, currentShelf.levels - 1) : 0,
      attributes: attrs,
      coverSource: cover?.source ?? null,
      coverRef: cover?.ref ?? null,
      externalSource: (external?.source as ItemInput["externalSource"]) ?? null,
      externalId: external?.id ?? null,
    };
    startTransition(async () => {
      if (item) {
        const res = await updateItem(item.id, input);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Cambios guardados");
        return onDone();
      }
      const res = await createItem(input);
      if (!res.ok) return void toast.error(res.error);
      // El número es para escribirlo en el lomo real, como en el de la pantalla.
      toast.success(`"${name.trim()}" es el ${inventoryLabel(res.data.inventoryNumber)}`);
      if (again) resetForNext();
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      {def.tmdb && (
        <TmdbPicker
          key={`${type}-${round}`}
          kind={def.tmdb}
          enabled={tmdbEnabled}
          initialQuery={name}
          onPick={(pick) => {
            setName(pick.name);
            setAttrs((a) => ({ ...a, ...pick.attributes }));
            if (pick.overview && !description.trim()) setDescription(pick.overview);
            setCover(pick.posterPath ? { source: "tmdb", ref: pick.posterPath } : null);
            setExternal({ source: "tmdb", id: pick.externalId });
          }}
        />
      )}
      {def.catalog && (
        <CatalogPicker
          key={`${type}-${round}`}
          catalog={def.catalog}
          initialQuery={name}
          onPick={(r) => {
            setName(r.title);
            // Lo que trae el catálogo pisa lo que estaba; el formato elegido queda.
            setAttrs((a) => {
              // El formato elegido queda si vale para este tipo (el form arranca en DVD, que no es
              // un formato de música); si no, el primero de la lista (CD para un disco).
              const options = def.fields.find((f) => f.key === "format")?.options;
              const format = options ? (a.format && options.includes(a.format) ? a.format : options[0]) : undefined;
              return { ...(format ? { format } : {}), ...r.attributes };
            });
            setCover(r.cover);
            setExternal({ source: r.catalog, id: r.externalId });
          }}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-[9.5rem_1fr]">
        <div className="mx-auto w-32 sm:mx-0 sm:w-auto">
          <Cover type={type} name={name || def.label} coverSource={cover?.source} coverRef={cover?.ref} />
          {cover && (
            <button
              type="button"
              onClick={() => setCover(null)}
              className="mt-1.5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Quitar tapa
            </button>
          )}
        </div>

        <div className="grid content-start gap-3.5">
          <div className={cn("grid gap-3", currentShelf && currentShelf.levels > 1 ? "grid-cols-3" : "grid-cols-2")}>
            <Field label="Tipo" htmlFor="f-type">
              <NativeSelect id="f-type" value={type} onChange={(e) => setType(e.target.value)}>
                {ITEM_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ITEM_TYPES[k].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Dónde está" htmlFor="f-shelf">
              <NativeSelect
                id="f-shelf"
                value={shelfId ?? ""}
                onChange={(e) => {
                  setShelfId(e.target.value || null);
                  setLevel(0);
                }}
              >
                <option value="">Sin ubicar</option>
                {shelves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {currentShelf && currentShelf.levels > 1 && (
              <Field label="Estante" htmlFor="f-level">
                <NativeSelect id="f-level" value={String(level)} onChange={(e) => setLevel(Number(e.target.value))}>
                  {Array.from({ length: currentShelf.levels }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? "1 (arriba)" : i === currentShelf.levels - 1 ? `${i + 1} (abajo)` : String(i + 1)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>

          <Field label="Nombre" htmlFor="f-name">
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </Field>

          {(def.fields.length > 0 || def.brandModel) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {def.brandModel && (
                <>
                  <Field label="Marca" htmlFor="f-brand">
                    <Input id="f-brand" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="Modelo" htmlFor="f-model">
                    <Input id="f-model" value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
                  </Field>
                </>
              )}
              {def.fields.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`f-${f.key}`}>
                  {f.kind === "select" ? (
                    <NativeSelect id={`f-${f.key}`} value={attrs[f.key] ?? ""} onChange={(e) => setAttr(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={`f-${f.key}`}
                      value={attrs[f.key] ?? ""}
                      onChange={(e) => setAttr(f.key, e.target.value)}
                      inputMode={f.kind === "number" ? "numeric" : undefined}
                      pattern={f.kind === "number" ? "\\d*" : undefined}
                      placeholder={f.placeholder}
                      maxLength={200}
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          <Field label="Descripción" htmlFor="f-desc">
            <Textarea id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        {!editing && (
          <Button type="submit" name="intent" value="again" variant="outline" disabled={pending || !name.trim()}>
            Agregar y cargar otro
          </Button>
        )}
        <Button type="submit" name="intent" value="done" disabled={pending || !name.trim()} className="sm:min-w-28">
          {pending && <Loader2 className="animate-spin" />}
          {editing ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

interface Pick {
  name: string;
  attributes: Record<string, string>;
  overview: string | null;
  posterPath: string | null;
  externalId: string;
}

/**
 * Buscar el título en TMDB y traer nombre, año, tapa y sinopsis. En una serie, después de elegirla
 * se elige la temporada: cada temporada tiene su propia tapa, que es la del DVD.
 */
function TmdbPicker({
  kind,
  enabled,
  initialQuery,
  onPick,
}: {
  kind: "movie" | "tv";
  enabled: boolean;
  initialQuery: string;
  onPick: (pick: Pick) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<TmdbResult[] | null>(null);
  const [show, setShow] = useState<TmdbResult | null>(null);
  const [seasons, setSeasons] = useState<TmdbSeason[] | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showGenre, setShowGenre] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        La búsqueda en TMDB no está configurada: cargalo a mano y se va a ver con la tapa genérica.
      </p>
    );
  }

  function search(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    startSearch(async () => {
      const res = await searchTmdbAction(kind, query);
      if (!res.ok) return void toast.error(res.error);
      setResults(res.data);
      setShow(null);
      setSeasons(null);
    });
  }

  function choose(r: TmdbResult) {
    if (kind === "movie") {
      setShow(r);
      const base: Pick = {
        name: r.title,
        attributes: r.year ? { year: r.year } : {},
        overview: r.overview,
        posterPath: r.posterPath,
        externalId: `movie:${r.id}`,
      };
      onPick(base);
      // Dirección y géneros vienen en otra llamada; si falla, queda lo demás.
      void movieDetailsAction(r.id).then((res) => {
        if (!res.ok) return;
        const extra: Record<string, string> = {};
        if (res.data.director) extra.director = res.data.director;
        if (res.data.genre) extra.genre = res.data.genre;
        onPick({ ...base, attributes: { ...base.attributes, ...extra } });
      });
      setResults(null);
      return;
    }
    setShow(r);
    setSelectedSeason(null);
    onPick({ name: r.title, attributes: {}, overview: r.overview, posterPath: r.posterPath, externalId: `tv:${r.id}` });
    startSearch(async () => {
      const res = await tvSeasonsAction(r.id);
      if (!res.ok) return void toast.error(res.error);
      setSeasons(res.data.seasons);
      setShowGenre(res.data.genre);
      if (res.data.genre) {
        onPick({ name: r.title, attributes: { genre: res.data.genre }, overview: r.overview, posterPath: r.posterPath, externalId: `tv:${r.id}` });
      }
    });
  }

  function chooseSeason(s: TmdbSeason) {
    if (!show) return;
    setSelectedSeason(s.seasonNumber);
    onPick({
      name: show.title,
      attributes: { season: String(s.seasonNumber), ...(s.year ? { year: s.year } : {}), ...(showGenre ? { genre: showGenre } : {}) },
      overview: show.overview,
      posterPath: s.posterPath ?? show.posterPath,
      externalId: `tv:${show.id}`,
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border bg-background/40 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(e)}
            placeholder={kind === "movie" ? "Buscá la película en TMDB" : "Buscá la serie en TMDB"}
            className="pl-8"
            aria-label="Buscar en TMDB"
          />
        </div>
        <Button type="button" variant="secondary" onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="animate-spin" /> : "Buscar"}
        </Button>
      </div>

      {results && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length ? "Elegí el que es:" : "No encontré nada con ese nombre."}</span>
            <button type="button" onClick={() => setResults(null)} aria-label="Cerrar resultados" className="hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          {results.length > 0 && (
            <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => choose(r)}
                    className={cn(
                      "w-full rounded-md p-1 text-left transition hover:bg-accent",
                      show?.id === r.id && "bg-accent ring-1 ring-primary",
                    )}
                  >
                    <Cover type={kind === "movie" ? "movie" : "series"} name={r.title} coverSource="tmdb" coverRef={r.posterPath} size="sm" />
                    <p className="mt-1 line-clamp-2 text-[11px] leading-tight">{r.title}</p>
                    {r.year && <p className="text-[11px] text-muted-foreground">{r.year}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {kind === "tv" && show && seasons && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">¿Qué temporada de {show.title} tenés?</p>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {seasons.map((s) => (
              <li key={s.seasonNumber} className="w-20 shrink-0">
                <button
                  type="button"
                  onClick={() => chooseSeason(s)}
                  className={cn(
                    "w-full rounded-md p-1 text-left transition hover:bg-accent",
                    selectedSeason === s.seasonNumber && "bg-accent ring-1 ring-primary",
                  )}
                >
                  <Cover type="series" name={s.name} coverSource="tmdb" coverRef={s.posterPath ?? show.posterPath} size="sm" />
                  <p className="mt-1 truncate text-[11px]">Temp. {s.seasonNumber}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Buscar un libro en Open Library o un disco en MusicBrainz: trae título, autor o artista, año y
 * tapa (la tapa de los discos la sirve Cover Art Archive y a veces no existe: se ve la genérica).
 */
function CatalogPicker({
  catalog,
  initialQuery,
  onPick,
}: {
  catalog: "books" | "albums";
  initialQuery: string;
  onPick: (r: CatalogResult & { catalog: "openlibrary" | "musicbrainz" }) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const books = catalog === "books";

  function search(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    startSearch(async () => {
      const res = await searchCatalogAction(catalog, query);
      if (!res.ok) return void toast.error(res.error);
      setResults(res.data);
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border bg-background/40 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(e)}
            placeholder={books ? "Buscá el libro en Open Library (título, autor o ISBN)" : "Buscá el disco en MusicBrainz (álbum y artista)"}
            className="pl-8"
            aria-label={books ? "Buscar en Open Library" : "Buscar en MusicBrainz"}
          />
        </div>
        <Button type="button" variant="secondary" onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="animate-spin" /> : "Buscar"}
        </Button>
      </div>

      {results && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length ? "Elegí el que es:" : "No encontré nada con ese nombre."}</span>
            <button type="button" onClick={() => setResults(null)} aria-label="Cerrar resultados" className="hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          {results.length > 0 && (
            <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
              {results.map((r) => (
                <li key={r.externalId}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(r.externalId);
                      onPick({ ...r, catalog: books ? "openlibrary" : "musicbrainz" });
                      setResults(null);
                    }}
                    className={cn("w-full rounded-md p-1 text-left transition hover:bg-accent", picked === r.externalId && "bg-accent ring-1 ring-primary")}
                  >
                    <Cover type={books ? "book" : "music"} name={r.title} coverSource={r.cover?.source} coverRef={r.cover?.ref} size="sm" />
                    <p className="mt-1 line-clamp-2 text-[11px] leading-tight font-medium">{r.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{[r.by, r.year].filter(Boolean).join(" · ")}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
