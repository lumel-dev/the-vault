"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTAINER_KIND_KEYS, type ContainerKind } from "@/lib/containers";
import type { VaultShelf } from "@/lib/queries";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ContainerIcon } from "./ContainerIcon";
import { useVault } from "./VaultStore";

export type ContainerDialogMode = { kind: "create" } | { kind: "edit"; shelf: VaultShelf };

interface Props {
  mode: ContainerDialogMode | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function ContainerDialog({ mode, onClose, onDeleted }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {mode && <Body key={mode.kind === "edit" ? mode.shelf.id : "new"} mode={mode} onClose={onClose} onDeleted={onDeleted} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ mode, onClose, onDeleted }: { mode: ContainerDialogMode; onClose: () => void; onDeleted: (id: string) => void }) {
  const shelf = mode.kind === "edit" ? mode.shelf : null;
  const [name, setName] = useState(shelf?.name ?? "");
  const [kind, setKind] = useState<ContainerKind>((shelf?.kind as ContainerKind) ?? "shelf");
  const [confirming, setConfirming] = useState(false);
  const { mutate } = useVault();
  const { t } = useI18n();

  function save(e: React.FormEvent) {
    e.preventDefault();
    // Los estantes no se eligen: un mueble mide 80 cm y suma estantes a medida que se llena.
    const input = { name, kind };
    const ok = shelf ? mutate({ kind: "updateShelf", id: shelf.id, input }) : mutate({ kind: "createShelf", id: crypto.randomUUID(), input });
    if (!ok) return;
    toast.success(shelf ? t.toast.containerSaved : t.toast.containerCreated(name.trim()));
    onClose();
  }

  function remove() {
    if (!shelf) return;
    if (!confirming) return setConfirming(true);
    if (!mutate({ kind: "deleteShelf", id: shelf.id })) return;
    toast.success(t.toast.containerDeleted(shelf.name));
    onDeleted(shelf.id);
    onClose();
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{shelf ? t.container.editTitle : t.container.newTitle}</DialogTitle>
        <DialogDescription>
          {shelf ? t.container.editDescription(shelf.count) : t.container.newDescription}
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t.container.what}</legend>
        <div className="grid grid-cols-3 gap-2">
          {CONTAINER_KIND_KEYS.map((k) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-center text-xs transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                kind === k ? "border-marker bg-tape font-semibold" : "border-border hover:border-marker/40",
              )}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              <ContainerIcon kind={k} className="size-7" />
              {t.container.kinds[k].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t.container.kinds[kind].hint}.</p>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="c-name">{t.container.name}</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t.container.namePlaceholder} required />
      </div>

      <DialogFooter className={cn(shelf && "sm:justify-between")}>
        {shelf && (
          <Button type="button" variant={confirming ? "destructive" : "ghost"} onClick={remove}>
            {confirming ? t.container.confirmDelete : t.container.delete}
          </Button>
        )}
        <Button type="submit" disabled={!name.trim()}>
          {shelf ? t.common.save : t.common.create}
        </Button>
      </DialogFooter>
    </form>
  );
}
