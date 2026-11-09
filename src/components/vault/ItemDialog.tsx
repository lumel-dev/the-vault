"use client";

import { Archive, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteItem } from "@/lib/actions/items";
import { typeDef, type ItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { Cover } from "./Cover";
import { ItemForm } from "./ItemForm";
import { TypeIcon } from "./TypeIcon";

type Mode = { kind: "view"; item: VaultItem } | { kind: "edit"; item: VaultItem } | { kind: "create"; type?: ItemType; shelfId: string | null };

interface Props {
  mode: Mode | null;
  shelves: VaultShelf[];
  tmdbEnabled: boolean;
  onChange: (mode: Mode | null) => void;
  onDeleted: (id: string) => void;
}

export type ItemDialogMode = Mode;

/** El detalle de un objeto, su edición y el alta: un solo diálogo que cambia de modo. */
export function ItemDialog({ mode, shelves, tmdbEnabled, onChange, onDeleted }: Props) {
  const close = () => onChange(null);
  const wide = mode?.kind !== "view";

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className={wide ? "max-h-[92dvh] overflow-y-auto sm:max-w-2xl" : "max-h-[92dvh] overflow-y-auto sm:max-w-xl"}>
        {mode?.kind === "view" && (
          <ItemDetail
            key={mode.item.id}
            item={mode.item}
            shelves={shelves}
            onEdit={() => onChange({ kind: "edit", item: mode.item })}
            onDeleted={() => {
              onDeleted(mode.item.id);
              close();
            }}
          />
        )}
        {mode?.kind === "edit" && (
          <>
            <DialogHeader>
              <DialogTitle>Editar</DialogTitle>
              <DialogDescription className="sr-only">Cambiá los datos de {mode.item.name}.</DialogDescription>
            </DialogHeader>
            <ItemForm
              key={mode.item.id}
              item={mode.item}
              shelves={shelves}
              tmdbEnabled={tmdbEnabled}
              onDone={close}
              onCancel={() => onChange({ kind: "view", item: mode.item })}
            />
          </>
        )}
        {mode?.kind === "create" && (
          <>
            <DialogHeader>
              <DialogTitle>Agregar a la bóveda</DialogTitle>
              <DialogDescription>Buscalo en TMDB para traer la tapa, o cargalo a mano.</DialogDescription>
            </DialogHeader>
            <ItemForm
              defaultType={mode.type}
              defaultShelfId={mode.shelfId}
              shelves={shelves}
              tmdbEnabled={tmdbEnabled}
              onDone={close}
              onCancel={close}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemDetail({
  item,
  shelves,
  onEdit,
  onDeleted,
}: {
  item: VaultItem;
  shelves: VaultShelf[];
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const def = typeDef(item.type);
  const shelf = shelves.find((s) => s.id === item.shelfId);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const facts: [string, string][] = [];
  if (def.brandModel) {
    if (item.brand) facts.push(["Marca", item.brand]);
    if (item.model) facts.push(["Modelo", item.model]);
  }
  for (const f of def.fields) {
    const v = item.attributes[f.key];
    if (v) facts.push([f.label, v]);
  }

  function remove() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteItem(item.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`"${item.name}" salió de la bóveda`);
      onDeleted();
    });
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[11rem_1fr]">
      <Cover
        type={item.type}
        name={item.name}
        coverSource={item.coverSource}
        coverRef={item.coverRef}
        size="lg"
        className="mx-auto w-40 shadow-2xl shadow-black/60 sm:w-auto"
      />
      <div className="grid content-start gap-4">
        <DialogHeader className="gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              <TypeIcon type={item.type} className="size-3" />
              {def.label}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Archive className="size-3" />
              {shelf?.name ?? "Sin ubicar"}
            </Badge>
          </div>
          <DialogTitle className="font-display text-2xl leading-tight font-bold">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Detalle de {item.name}</DialogDescription>
        </DialogHeader>

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {item.description && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{item.description}</p>}

        <div className="mt-1 flex gap-2">
          <Button onClick={onEdit} variant="secondary">
            <Pencil />
            Editar
          </Button>
          <Button onClick={remove} variant={confirming ? "destructive" : "ghost"} disabled={pending}>
            <Trash2 />
            {confirming ? "¿Seguro? Eliminar" : "Eliminar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
