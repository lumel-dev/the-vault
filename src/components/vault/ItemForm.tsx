"use client";

import { Loader2, Search, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { searchCatalogAction } from "@/lib/actions/catalogs";
import type { ItemInput } from "@/lib/schemas";
import { useVault } from "./VaultStore";
import { movieDetailsAction, searchTmdbAction, tvSeasonsAction } from "@/lib/actions/tmdb";
import type { CatalogResult } from "@/lib/catalogs";
import { typeDef, type ItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import type { TmdbResult, TmdbSeason } from "@/lib/tmdb";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { useStickers } from "./StickersContext";
import { useLiveSearch } from "@/lib/use-live-search";
import { Cover } from "./Cover";

interface Props {
  item?: VaultItem;
  /** El sticker con el que arranca (el del filtro activo); si no, el primero de películas. */
  defaultStickerId?: string;
  defaultShelfId?: string | null;
  /** Lo que ya hay: una temporada nueva de una serie va, de entrada, a donde están las otras. */
  items?: VaultItem[];
  shelves: VaultShelf[];
  tmdbEnabled: boolean;
  onDone: () => void;
  onCancel: () => void;
}

interface CoverRef {
  source: string;
  ref: string;
}

export function ItemForm({ item, defaultStickerId, defaultShelfId = null, items = [], shelves, tmdbEnabled, onDone, onCancel }: Props) {
  const editing = Boolean(item);
  const { stickers, of: stickerOf, label: stickerName } = useStickers();
  // El sticker manda: el tipo (catálogo, campos, forma) es su `base`.
  const [stickerId, setStickerId] = useState<string>(
    () => (item ? stickerOf(item).id : defaultStickerId) || (stickers.find((s) => s.base === "movie") ?? stickers[0])?.id || "",
  );
  const sticker = stickers.find((s) => s.id === stickerId) ?? stickerOf(item ?? { stickerId: null, type: "movie" });
  const type = sticker.base;
  const [initialType] = useState(type);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [model, setModel] = useState(item?.model ?? "");
  const [shelfId, setShelfId] = useState<string | null>(item ? item.shelfId : defaultShelfId);
  // Si el lugar lo eligió la persona, elegir un título del catálogo no lo cambia.
  const [placeTouched, setPlaceTouched] = useState(false);
  // Lo nuevo arranca en DVD: es para lo que más se usa la app.
  const [attrs, setAttrs] = useState<Record<string, string>>(item?.attributes ?? { format: "DVD" });
  const [cover, setCover] = useState<CoverRef | null>(
    item?.coverSource && item.coverRef ? { source: item.coverSource, ref: item.coverRef } : null,
  );
  // De qué catálogo salió (TMDB, Open Library, MusicBrainz) y su id ahí.
  const [external, setExternal] = useState<{ source: string; id: string } | null>(
    item?.externalSource && item.externalId ? { source: item.externalSource, id: item.externalId } : null,
  );
  const { mutate } = useVault();

  const def = typeDef(type);
  const { t, locale } = useI18n();

  /** Al cargar algo nuevo que ya tiene "hermanos" (otra temporada de la misma serie), va con ellos. */
  function placeLikeSiblings(externalId: string) {
    if (editing || placeTouched) return;
    const siblings = items.filter((i) => i.externalId === externalId);
    if (!siblings.length) return;
    const season = (i: VaultItem) => Number(i.attributes.season) || 0;
    const last = siblings.reduce((a, b) => (season(b) > season(a) ? b : a));
    setShelfId(last.shelfId);
    // Y con el mismo sticker (si es del mismo tipo: "Anime" en vez de "Series").
    const theirs = stickerOf(last);
    if (theirs.id && theirs.base === type) setStickerId(theirs.id);
  }

  function setAttr(key: string, value: string) {
    setAttrs((a) => ({ ...a, [key]: value }));
  }

  const [round, setRound] = useState(0);
  // Lo escrito en el buscador de catálogo vive acá y no en el buscador: al cambiar de tipo, el
  // buscador se rearma y vuelve a buscar lo mismo en el catálogo del tipo nuevo.
  const [lookup, setLookup] = useState(item?.name ?? "");

  /** Después de "Agregar y cargar otro": queda el lugar, el tipo y el formato; lo demás se limpia. */
  function resetForNext() {
    setName("");
    setLookup("");
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
      stickerId: sticker.id || null,
      name,
      description,
      brand: def.brandModel ? brand : null,
      model: def.brandModel ? model : null,
      shelfId,
      attributes: attrs,
      coverSource: cover?.source ?? null,
      coverRef: cover?.ref ?? null,
      externalSource: (external?.source as ItemInput["externalSource"]) ?? null,
      externalId: external?.id ?? null,
    };
    // Se guarda en la cola y se ve al instante; el server lo confirma cuando hay señal.
    if (item) {
      if (!mutate({ kind: "updateItem", id: item.id, input, locale })) return;
      toast.success(t.toast.saved);
      return onDone();
    }
    if (!mutate({ kind: "createItem", id: crypto.randomUUID(), input })) return;
    // El número para el lomo llega con la confirmación del server (`VaultStore`); sin señal, se avisa
    // que quedó acá.
    if (!navigator.onLine) toast.success(t.offline.savedHere(name.trim()));
    if (again) resetForNext();
    else onDone();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {def.tmdb && (
        <TmdbPicker
          key={`${type}-${round}`}
          kind={def.tmdb}
          enabled={tmdbEnabled}
          query={lookup}
          onQueryChange={setLookup}
          searchOnMount={round > 0 || type !== initialType}
          onPick={(pick) => {
            setName(pick.name);
            setAttrs((a) => ({ ...a, ...pick.attributes }));
            if (pick.overview && !description.trim()) setDescription(pick.overview);
            setCover(pick.posterPath ? { source: "tmdb", ref: pick.posterPath } : null);
            setExternal({ source: "tmdb", id: pick.externalId });
            placeLikeSiblings(pick.externalId);
          }}
        />
      )}
      {def.catalog && (
        <CatalogPicker
          key={`${type}-${round}`}
          catalog={def.catalog}
          query={lookup}
          onQueryChange={setLookup}
          searchOnMount={round > 0 || type !== initialType}
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
            placeLikeSiblings(r.externalId);
          }}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-[9.5rem_1fr]">
        <div className="mx-auto w-32 sm:mx-0 sm:w-auto">
          <Cover type={type} stickerColor={sticker.color} name={name || t.types[type as ItemType].label} coverSource={cover?.source} coverRef={cover?.ref} />
          {cover && (
            <button
              type="button"
              onClick={() => setCover(null)}
              className="mt-1.5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {t.form.removeCover}
            </button>
          )}
        </div>

        <div className="grid content-start gap-3.5">
          {/* El estante no se elige: lo nuevo va al último estante con lugar del mueble. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.form.sticker} htmlFor="f-type">
              <NativeSelect id="f-type" value={sticker.id} onChange={(e) => setStickerId(e.target.value)}>
                {stickers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {stickerName(s)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.form.where} htmlFor="f-shelf">
              <NativeSelect
                id="f-shelf"
                value={shelfId ?? ""}
                onChange={(e) => {
                  setShelfId(e.target.value || null);
                  setPlaceTouched(true);
                }}
              >
                <option value="">{t.where.unplaced}</option>
                {shelves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label={t.form.name} htmlFor="f-name">
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </Field>

          {(def.fields.length > 0 || def.brandModel) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {def.brandModel && (
                <>
                  <Field label={t.panel.brand} htmlFor="f-brand">
                    <Input id="f-brand" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} />
                  </Field>
                  <Field label={t.panel.model} htmlFor="f-model">
                    <Input id="f-model" value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
                  </Field>
                </>
              )}
              {def.fields.map((f) => (
                <Field key={f.key} label={t.fields[f.key]} htmlFor={`f-${f.key}`}>
                  {f.kind === "select" ? (
                    <NativeSelect id={`f-${f.key}`} value={attrs[f.key] ?? ""} onChange={(e) => setAttr(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {t.options[o] ?? o}
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
                      placeholder={f.placeholder ? (t.placeholders[f.placeholder as keyof typeof t.placeholders] ?? f.placeholder) : undefined}
                      maxLength={200}
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          <Field label={t.form.description} htmlFor="f-desc">
            <Textarea id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        {!editing && (
          <Button type="submit" name="intent" value="again" variant="outline" disabled={!name.trim()}>
            {t.form.addAnother}
          </Button>
        )}
        <Button type="submit" name="intent" value="done" disabled={!name.trim()} className="sm:min-w-28">
          {editing ? t.common.save : t.form.add}
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
  query,
  onQueryChange,
  searchOnMount,
  onPick,
}: {
  kind: "movie" | "tv";
  enabled: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  searchOnMount: boolean;
  onPick: (pick: Pick) => void;
}) {
  const [results, setResults] = useState<TmdbResult[] | null>(null);
  const [show, setShow] = useState<TmdbResult | null>(null);
  const [seasons, setSeasons] = useState<TmdbSeason[] | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [showGenre, setShowGenre] = useState<string | null>(null);
  const [loadingSeasons, startSeasons] = useTransition();
  const { t } = useI18n();
  const live = useLiveSearch(
    (q) => searchTmdbAction(kind, q),
    (res) => {
      if (!res.ok) return void toast.error(res.error);
      setResults(res.data);
      setShow(null);
      setSeasons(null);
    },
    { initialQuery: searchOnMount && enabled ? query : "" },
  );

  if (!enabled) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        {t.form.tmdbOff}
      </p>
    );
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
    startSeasons(async () => {
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border bg-background/40 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              live.schedule(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              live.now(query);
            }}
            placeholder={kind === "movie" ? t.form.tmdbMovie : t.form.tmdbTv}
            className="pr-8 pl-8"
            aria-label={t.form.tmdbAria}
          />
          {(live.searching || loadingSeasons) && (
            <Loader2 className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {live.failed && <p className="text-xs text-muted-foreground">{t.offline.search}</p>}

      {results && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length ? t.form.pick : t.form.nothingFound}</span>
            <button type="button" onClick={() => setResults(null)} aria-label={t.form.closeResults} className="hover:text-foreground">
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
          <p className="mb-1.5 text-xs text-muted-foreground">{t.form.whichSeason(show.title)}</p>
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
                  <p className="mt-1 truncate text-[11px]">{t.form.seasonChip(s.seasonNumber)}</p>
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
  query,
  onQueryChange,
  searchOnMount,
  onPick,
}: {
  catalog: "books" | "albums";
  query: string;
  onQueryChange: (q: string) => void;
  searchOnMount: boolean;
  onPick: (r: CatalogResult & { catalog: "openlibrary" | "musicbrainz" }) => void;
}) {
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const books = catalog === "books";
  const { t } = useI18n();
  // MusicBrainz acepta un pedido por segundo: con discos se espera más a que se deje de tipear.
  const live = useLiveSearch(
    (q) => searchCatalogAction(catalog, q),
    (res) => {
      if (!res.ok) return void toast.error(res.error);
      setResults(res.data);
    },
    { delay: books ? 350 : 700, initialQuery: searchOnMount ? query : "" },
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border bg-background/40 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              live.schedule(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              live.now(query);
            }}
            placeholder={books ? t.form.booksPlaceholder : t.form.albumsPlaceholder}
            className="pr-8 pl-8"
            aria-label={books ? t.form.booksAria : t.form.albumsAria}
          />
          {live.searching && (
            <Loader2 className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {live.failed && <p className="text-xs text-muted-foreground">{t.offline.search}</p>}

      {results && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{results.length ? t.form.pick : t.form.nothingFound}</span>
            <button type="button" onClick={() => setResults(null)} aria-label={t.form.closeResults} className="hover:text-foreground">
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
