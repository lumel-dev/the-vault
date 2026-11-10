"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inventoryLabel } from "@/lib/containers";
import type { ItemType } from "@/lib/item-types";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { useI18n } from "@/lib/i18n/client";
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
  const { t } = useI18n();
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {mode?.kind === "edit" && (
          <>
            <DialogHeader>
              <DialogTitle>{t.dialog.editTitle(inventoryLabel(mode.item.inventoryNumber, t))}</DialogTitle>
              <DialogDescription className="sr-only">{t.dialog.editDescription(mode.item.name)}</DialogDescription>
            </DialogHeader>
            <ItemForm key={mode.item.id} item={mode.item} shelves={shelves} tmdbEnabled={tmdbEnabled} onDone={onClose} onCancel={onClose} />
          </>
        )}
        {mode?.kind === "create" && (
          <>
            <DialogHeader>
              <DialogTitle>{t.dialog.addTitle}</DialogTitle>
              <DialogDescription>{t.dialog.addDescription}</DialogDescription>
            </DialogHeader>
            <ItemForm defaultType={mode.type} defaultShelfId={mode.shelfId} shelves={shelves} tmdbEnabled={tmdbEnabled} onDone={onClose} onCancel={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
