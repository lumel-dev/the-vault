"use client";

import { useDroppable } from "@dnd-kit/core";
import { Archive, Inbox, Layers, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { createShelf } from "@/lib/actions/shelves";
import type { VaultShelf } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const SHELF_DROP_PREFIX = "shelf:";

interface Props {
  shelves: VaultShelf[];
  unshelved: number;
  total: number;
  current: string;
  hrefFor: (shelf: string) => string;
  dragging: boolean;
  onEdit: (shelf: VaultShelf) => void;
}

function ShelfLink({
  id,
  href,
  active,
  droppable,
  dragging,
  icon,
  label,
  count,
  onEdit,
}: {
  id: string;
  href: string;
  active: boolean;
  droppable: boolean;
  dragging: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onEdit?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: SHELF_DROP_PREFIX + id, disabled: !droppable });

  return (
    <li ref={setNodeRef} className="group/shelf relative shrink-0">
      <Link
        href={href}
        scroll={false}
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm whitespace-nowrap transition-colors md:pr-9",
          active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          dragging && droppable && "border-dashed border-border",
          isOver && "border-solid border-primary bg-primary/15 text-foreground",
        )}
      >
        <span className={cn("shrink-0", isOver && "text-primary")}>{icon}</span>
        <span className="truncate">{label}</span>
        <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{count}</span>
      </Link>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${label}`}
          className="absolute top-1/2 right-1.5 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 group-hover/shelf:opacity-100 md:grid"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/**
 * Los estantes: filtran la grilla al tocarlos y reciben objetos al soltarlos encima. En el
 * celular es una fila que se desliza; en desktop, la barra lateral.
 */
export function ShelfNav({ shelves, unshelved, total, current, hrefFor, dragging, onEdit }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createShelf(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Estante "${res.data.name}" creado`);
      setName("");
      setAdding(false);
    });
  }

  return (
    <nav aria-label="Estantes">
      <p className="mb-2 hidden px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase md:block">Estantes</p>
      <ul className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
        <ShelfLink
          id="all"
          href={hrefFor("all")}
          active={current === "all"}
          droppable={false}
          dragging={dragging}
          icon={<Layers className="size-4" />}
          label="Toda la colección"
          count={total}
        />
        <ShelfLink
          id="none"
          href={hrefFor("none")}
          active={current === "none"}
          droppable
          dragging={dragging}
          icon={<Inbox className="size-4" />}
          label="Sin ubicar"
          count={unshelved}
        />
        {shelves.map((s) => (
          <ShelfLink
            key={s.id}
            id={s.id}
            href={hrefFor(s.id)}
            active={current === s.id}
            droppable
            dragging={dragging}
            icon={<Archive className="size-4" />}
            label={s.name}
            count={s.count}
            onEdit={() => onEdit(s)}
          />
        ))}
        <li className="shrink-0 md:mt-1">
          {adding ? (
            <form onSubmit={submit} className="flex items-center gap-1 px-1 py-0.5">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => !name && setAdding(false)}
                onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                placeholder="Living, Caja 3…"
                maxLength={60}
                disabled={pending}
                className="h-8 w-40 md:w-full"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <Plus className="size-4" />
              Nuevo estante
            </button>
          )}
        </li>
      </ul>
    </nav>
  );
}
