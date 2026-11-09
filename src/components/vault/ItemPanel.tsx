"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inventoryLabel } from "@/lib/containers";
import { typeDef } from "@/lib/item-types";
import type { VaultItem } from "@/lib/queries";
import type { Whereabouts } from "@/lib/where";
import { Cover } from "./Cover";
import { SeasonsCheck } from "./SeasonsCheck";
import { Sticker } from "./Sticker";

interface Props {
  item: VaultItem;
  /** Toda la colección: para saber qué otras temporadas de la serie tenés. */
  collection: VaultItem[];
  where: Whereabouts;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * El objeto elegido: dónde está, en cinta de papel, y sus datos. No es un diálogo: queda al costado
 * mientras se sigue mirando el mueble (abajo, en el celular).
 */
export function ItemPanel({ item, collection, where, onClose, onEdit, onDelete }: Props) {
  const tvId = item.type === "series" && item.externalSource === "tmdb" && item.externalId?.startsWith("tv:") ? Number(item.externalId.slice(3)) : null;
  const owned = new Set(
    collection.filter((i) => i.type === "series" && i.externalId === item.externalId && i.attributes.season).map((i) => Number(i.attributes.season)),
  );
  const def = typeDef(item.type);
  const facts: [string, string][] = [];
  if (def.brandModel) {
    if (item.brand) facts.push(["Marca", item.brand]);
    if (item.model) facts.push(["Modelo", item.model]);
  }
  for (const f of def.fields) {
    const v = item.attributes[f.key];
    if (v) facts.push([f.label, v]);
  }

  return (
    <aside
      aria-label={`${item.name}, dónde está`}
      className="pointer-events-auto max-h-[min(70dvh,44rem)] w-full overflow-y-auto rounded-t-xl bg-card p-5 shadow-[0_-8px_30px_-10px_rgb(28_27_25/45%)] md:w-80 md:rounded-xl md:shadow-[0_18px_40px_-16px_rgb(28_27_25/55%)]"
    >
      <div className="flex items-start gap-4">
        <Cover type={item.type} name={item.name} coverSource={item.coverSource} coverRef={item.coverRef} size="sm" className="w-20 shrink-0 shadow-[0_6px_14px_-6px_rgb(28_27_25/60%)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-bold text-balance">
            {item.name}
            {item.type === "series" && item.attributes.season ? ` · T${item.attributes.season}` : ""}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sticker type={item.type} className="size-2.5" />
            {def.label} · <span className="tabular-nums">{inventoryLabel(item.inventoryNumber)}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <p className="tape mt-4 inline-block -rotate-1 px-3 py-1 text-base leading-snug">
        {where.container.toUpperCase()}
        {where.level && ` · ${where.level.toUpperCase()}`}
        <span className="block text-sm">{where.place}</span>
      </p>

      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {tvId ? (
        <SeasonsCheck tvId={tvId} owned={owned} />
      ) : item.type === "series" ? (
        <p className="mt-4 text-xs text-muted-foreground">Para saber qué temporadas te faltan, editala y elegila en TMDB.</p>
      ) : null}

      {item.description && <p className="mt-4 line-clamp-6 text-sm leading-relaxed text-muted-foreground">{item.description}</p>}

      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onEdit}>
          <Pencil />
          Editar
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 />
          Sacar de la bóveda
        </Button>
      </div>
    </aside>
  );
}
