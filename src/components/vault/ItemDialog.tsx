"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inventoryLabel } from "@/lib/containers";
import type { ItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { ItemForm } from "./ItemForm";

export type ItemDialogMode = { kind: "edit"; item: VaultItem } | { kind: "create"; type?: ItemType; shelfId: string | null };

interface Props {
  mode: ItemDialogMode | null;
  shelves: VaultShelf[];
  tmdbEnabled: boolean;
  onClose: () => void;
}

/** Alta y edición. El detalle no es un diálogo: es el panel lateral (`ItemPanel`). */
export function ItemDialog({ mode, shelves, tmdbEnabled, onClose }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {mode?.kind === "edit" && (
          <>
            <DialogHeader>
              <DialogTitle>Editar · {inventoryLabel(mode.item.inventoryNumber)}</DialogTitle>
              <DialogDescription className="sr-only">Cambiá los datos de {mode.item.name}.</DialogDescription>
            </DialogHeader>
            <ItemForm key={mode.item.id} item={mode.item} shelves={shelves} tmdbEnabled={tmdbEnabled} onDone={onClose} onCancel={onClose} />
          </>
        )}
        {mode?.kind === "create" && (
          <>
            <DialogHeader>
              <DialogTitle>Agregar a la bóveda</DialogTitle>
              <DialogDescription>Buscalo para traer los datos y la tapa (películas y series en TMDB, libros en Open Library, discos en MusicBrainz) o cargalo a mano. Cada cosa nueva recibe su número de inventario.</DialogDescription>
            </DialogHeader>
            <ItemForm defaultType={mode.type} defaultShelfId={mode.shelfId} shelves={shelves} tmdbEnabled={tmdbEnabled} onDone={onClose} onCancel={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
