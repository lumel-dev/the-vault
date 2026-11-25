"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createSticker, deleteSticker, updateSticker } from "@/lib/actions/stickers";
import { ITEM_TYPE_KEYS, type ItemType } from "@/lib/item-types";
import { useI18n } from "@/lib/i18n/client";
import { STICKER_PALETTE } from "@/lib/stickers";
import { cn } from "@/lib/utils";
import { Sticker } from "./Sticker";
import { useStickers, type StickerWithCount } from "./StickersContext";

export type StickerDialogMode = { kind: "create" } | { kind: "edit"; sticker: StickerWithCount };

export function StickerDialog({ mode, onClose, onDeleted }: { mode: StickerDialogMode | null; onClose: () => void; onDeleted: (id: string) => void }) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {mode && <Body key={mode.kind === "edit" ? mode.sticker.id : "new"} mode={mode} onClose={onClose} onDeleted={onDeleted} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ mode, onClose, onDeleted }: { mode: StickerDialogMode; onClose: () => void; onDeleted: (id: string) => void }) {
  const sticker = mode.kind === "edit" ? mode.sticker : null;
  const { t } = useI18n();
  const { stickers, label } = useStickers();
  const [base, setBase] = useState<ItemType>((sticker?.base as ItemType) ?? "other");
  // Los de fábrica no tienen nombre propio: el campo arranca vacío y muestra el del tipo de ejemplo.
  const [name, setName] = useState(sticker?.name ?? "");
  const [color, setColor] = useState(sticker?.color ?? STICKER_PALETTE[6]);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const used = sticker ? sticker.count : 0;
  const baseLocked = used > 0;
  // Adónde pasar lo que tiene si se borra: otro sticker del mismo tipo.
  const targets = stickers.filter((s) => sticker && s.id !== sticker.id && s.base === sticker.base);
  const [moveTo, setMoveTo] = useState(targets[0]?.id ?? "");
  const defaultName = label({ name: null, base });

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const input = { name: name.trim() || null, color, base };
      const res = sticker ? await updateSticker(sticker.id, input) : await createSticker(input);
      if (!res.ok) return void toast.error(res.error);
      toast.success(sticker ? t.stickers.saved : t.stickers.created(name.trim() || defaultName));
      onClose();
    });
  }

  function remove() {
    if (!sticker) return;
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteSticker(sticker.id, used > 0 ? moveTo : null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(t.stickers.deleted(label(sticker)));
      onDeleted(sticker.id);
      onClose();
    });
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sticker color={color} className="size-4" />
          {sticker ? t.stickers.editTitle : t.stickers.newTitle}
        </DialogTitle>
        <DialogDescription>{sticker ? t.stickers.editDescription(used) : t.stickers.newDescription}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="s-name">{t.stickers.name}</Label>
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={defaultName} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t.stickers.color}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {STICKER_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={cn("grid size-8 place-items-center rounded-full shadow-[inset_0_-2px_0_rgb(0_0_0/18%)] ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-marker")}
              style={{ background: c }}
            >
              {color === c && <Check className={cn("size-4", c === "#f4f2ec" || c === "#f2c230" ? "text-marker" : "text-white")} />}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-8 cursor-pointer rounded-full border border-border bg-transparent" aria-label={t.stickers.otherColor} />
            {t.stickers.otherColor}
          </label>
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="s-base">{t.stickers.base}</Label>
        <NativeSelect id="s-base" value={base} onChange={(e) => setBase(e.target.value as ItemType)} disabled={baseLocked}>
          {ITEM_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {t.types[k].label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">{baseLocked ? t.stickers.baseLocked : t.stickers.baseHint}</p>
      </div>

      {sticker && confirming && used > 0 && (
        <div className="grid gap-1.5 rounded-md border border-marker-red/40 bg-marker-red/5 p-3">
          <Label htmlFor="s-move">{t.stickers.moveTo(used)}</Label>
          {targets.length ? (
            <NativeSelect id="s-move" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <p className="text-xs">{t.stickers.noTarget(t.types[sticker.base as ItemType]?.label ?? "")}</p>
          )}
        </div>
      )}

      <DialogFooter className={cn(sticker && "sm:justify-between")}>
        {sticker && (
          <Button type="button" variant={confirming ? "destructive" : "ghost"} onClick={remove} disabled={pending || (confirming && used > 0 && !targets.length)}>
            {confirming ? t.stickers.confirmDelete : t.stickers.delete}
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {sticker ? t.common.save : t.common.create}
        </Button>
      </DialogFooter>
    </form>
  );
}
