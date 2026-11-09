"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteShelf, renameShelf } from "@/lib/actions/shelves";
import type { VaultShelf } from "@/lib/queries";

interface Props {
  shelf: VaultShelf | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function ShelfDialog({ shelf, onClose, onDeleted }: Props) {
  return (
    <Dialog open={shelf !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {shelf && <ShelfDialogBody key={shelf.id} shelf={shelf} onClose={onClose} onDeleted={onDeleted} />}
      </DialogContent>
    </Dialog>
  );
}

function ShelfDialogBody({ shelf, onClose, onDeleted }: { shelf: VaultShelf; onClose: () => void; onDeleted: (id: string) => void }) {
  const [name, setName] = useState(shelf.name);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameShelf(shelf.id, name);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Estante actualizado");
      onClose();
    });
  }

  function remove() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteShelf(shelf.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Estante "${shelf.name}" borrado`);
      onDeleted(shelf.id);
      onClose();
    });
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Estante</DialogTitle>
        <DialogDescription>
          {shelf.count === 1 ? "Tiene 1 objeto." : `Tiene ${shelf.count} objetos.`} Si lo borrás, lo que tiene queda en
          &quot;Sin ubicar&quot;.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="shelf-name">Nombre</Label>
        <Input id="shelf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </div>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
          {confirming ? "¿Seguro? Borrar" : "Borrar estante"}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}
