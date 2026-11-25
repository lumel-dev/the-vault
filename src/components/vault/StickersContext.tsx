"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { stickerFor, stickerLabel, type VaultSticker } from "@/lib/stickers";

export type StickerWithCount = VaultSticker & { count: number };

interface StickersValue {
  stickers: StickerWithCount[];
  /** El sticker de un objeto, con su nombre ya en el idioma de la interfaz. */
  of: (item: { stickerId: string | null; type: string }) => VaultSticker & { label: string };
  label: (sticker: Pick<VaultSticker, "name" | "base">) => string;
}

const Ctx = createContext<StickersValue | null>(null);

/** Los stickers del usuario, para que cualquier tarjeta, lomo o ficha sepa su color y su nombre. */
export function StickersProvider({ stickers, children }: { stickers: StickerWithCount[]; children: ReactNode }) {
  const { t } = useI18n();
  const value = useMemo<StickersValue>(() => {
    const label = (s: Pick<VaultSticker, "name" | "base">) => stickerLabel(s, t);
    return {
      stickers,
      label,
      of: (item) => {
        const s = stickerFor(item, stickers);
        return { ...s, label: stickerLabel(s, t, true) };
      },
    };
  }, [stickers, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStickers(): StickersValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useStickers fuera de StickersProvider");
  return value;
}
