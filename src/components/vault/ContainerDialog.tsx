"use client";

import { Minus, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createShelf, deleteShelf, updateShelf } from "@/lib/actions/shelves";
import { clampLevels, CONTAINER_KIND_KEYS, CONTAINER_KINDS, type ContainerKind } from "@/lib/containers";
import type { VaultShelf } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ContainerIcon } from "./ContainerIcon";

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
  const [levels, setLevels] = useState(shelf?.levels ?? CONTAINER_KINDS.shelf.defaultLevels);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const def = CONTAINER_KINDS[kind];
  const shownLevels = clampLevels(kind, levels);

  function chooseKind(k: ContainerKind) {
    setKind(k);
    setLevels((l) => (k === "box" ? 1 : l <= 1 ? CONTAINER_KINDS[k].defaultLevels : clampLevels(k, l)));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const input = { name, kind, levels: shownLevels };
      const res = shelf ? await updateShelf(shelf.id, input) : await createShelf(input);
      if (!res.ok) return void toast.error(res.error);
      toast.success(shelf ? "Contenedor actualizado" : `"${name.trim()}" está en la casa`);
      onClose();
    });
  }

  function remove() {
    if (!shelf) return;
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteShelf(shelf.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`"${shelf.name}" ya no está; lo que tenía quedó sin ubicar`);
      onDeleted(shelf.id);
      onClose();
    });
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{shelf ? "Editar contenedor" : "Nuevo contenedor"}</DialogTitle>
        <DialogDescription>
          {shelf
            ? `Tiene ${shelf.count === 1 ? "1 objeto" : `${shelf.count} objetos`}. Si lo borrás, lo que tiene queda sin ubicar.`
            : "Un mueble o una caja que existe en tu casa. Va a aparecer con su forma en la vista Mueble."}
        </DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Qué es</legend>
        <div className="grid grid-cols-3 gap-2">
          {CONTAINER_KIND_KEYS.map((k) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-center text-xs transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                kind === k ? "border-marker bg-tape font-semibold" : "border-border hover:border-marker/40",
              )}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => chooseKind(k)} className="sr-only" />
              <ContainerIcon kind={k} className="size-7" />
              {CONTAINER_KINDS[k].label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{def.hint}.</p>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="c-name">Nombre</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Living, Caja 3, Mueble de la tele" required />
      </div>

      {def.maxLevels > 1 && (
        <div className="flex items-center justify-between gap-4">
          <Label id="c-levels">Estantes</Label>
          <div role="group" aria-labelledby="c-levels" className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" aria-label="Un estante menos" disabled={shownLevels <= def.minLevels} onClick={() => setLevels(shownLevels - 1)}>
              <Minus />
            </Button>
            <output className="w-8 text-center font-semibold tabular-nums" aria-live="polite">
              {shownLevels}
            </output>
            <Button type="button" variant="outline" size="icon" aria-label="Un estante más" disabled={shownLevels >= def.maxLevels} onClick={() => setLevels(shownLevels + 1)}>
              <Plus />
            </Button>
          </div>
        </div>
      )}

      <DialogFooter className={cn(shelf && "sm:justify-between")}>
        {shelf && (
          <Button type="button" variant={confirming ? "destructive" : "ghost"} onClick={remove} disabled={pending}>
            {confirming ? "¿Seguro? Borrar" : "Borrar contenedor"}
          </Button>
        )}
        <Button type="submit" disabled={pending || !name.trim()}>
          {shelf ? "Guardar" : "Crear"}
        </Button>
      </DialogFooter>
    </form>
  );
}
