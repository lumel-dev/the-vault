/**
 * Los cambios de la cola aplicados a la copia de la colección que tiene el browser. Puro: lo usan
 * la app y los tests.
 *
 * Hace lo mismo que el server con el **orden de la lista** (el orden de `items` es el de los
 * muebles), sin tocar `position`: cuando el server confirma, la colección que manda pisa esta.
 * Mientras tanto, cada cambio pendiente se vuelve a aplicar sobre la última colección que llegó,
 * así que todo tiene que ser idempotente: crear algo que ya está no hace nada, y lo que ya no
 * tiene sobre qué aplicarse (se borró en otro lado) se saltea.
 *
 * `validateOp` dice antes de encolar si el server lo va a rechazar, con el mismo texto: un error
 * de tipeo se avisa al instante, haya señal o no.
 */
import type { ItemTranslations } from "@/lib/db/schema";
import { isValidCover } from "@/lib/covers";
import type { Messages } from "@/lib/i18n";
import { cleanAttributes } from "@/lib/item-types";
import type { VaultItem, VaultShelf, VaultStickerRow } from "@/lib/queries";
import { EXTERNAL_ID, itemSchema, shelfSchema, stickerSchema } from "@/lib/schemas";
import { siblingIndex } from "@/lib/siblings";
import type { Op } from "./ops";

export interface VaultData {
  items: VaultItem[];
  shelves: VaultShelf[];
  stickers: VaultStickerRow[];
}

/** Los cambios en orden, y después las cuentas de cada contenedor y sticker. */
export function applyOps(data: VaultData, ops: Op[]): VaultData & { unshelved: number } {
  return withCounts(ops.reduce(applyOp, data));
}

export function withCounts(data: VaultData): VaultData & { unshelved: number } {
  const byShelf = new Map<string, number>();
  const bySticker = new Map<string, number>();
  for (const i of data.items) {
    if (i.shelfId) byShelf.set(i.shelfId, (byShelf.get(i.shelfId) ?? 0) + 1);
    if (i.stickerId) bySticker.set(i.stickerId, (bySticker.get(i.stickerId) ?? 0) + 1);
  }
  const known = new Set(data.shelves.map((s) => s.id));
  return {
    items: data.items,
    shelves: data.shelves.map((s) => (s.count === (byShelf.get(s.id) ?? 0) ? s : { ...s, count: byShelf.get(s.id) ?? 0 })),
    stickers: data.stickers.map((s) => (s.count === (bySticker.get(s.id) ?? 0) ? s : { ...s, count: bySticker.get(s.id) ?? 0 })),
    unshelved: data.items.filter((i) => !i.shelfId || !known.has(i.shelfId)).length,
  };
}

/* ------------------------------------------------------------------ objetos */

function pickSticker(stickers: VaultStickerRow[], stickerId: string | null | undefined, type: string) {
  if (stickerId) return stickers.find((s) => s.id === stickerId) ?? null;
  return stickers.find((s) => s.base === type) ?? null;
}

/** Lo mismo que `toValues` del server: atributos del tipo, y tapa e id de catálogo sólo si son válidos. */
function values(data: ReturnType<typeof itemSchema.parse>, type: string) {
  const coverOk = isValidCover(data.coverSource, data.coverRef);
  const externalOk = Boolean(data.externalSource && data.externalId && EXTERNAL_ID[data.externalSource]?.test(data.externalId));
  return {
    type,
    name: data.name,
    description: data.description,
    brand: data.brand,
    model: data.model,
    attributes: cleanAttributes(type, data.attributes),
    coverSource: coverOk ? data.coverSource! : null,
    coverRef: coverOk ? data.coverRef! : null,
    externalSource: externalOk ? data.externalSource! : null,
    externalId: externalOk ? data.externalId! : null,
  };
}

/** Dónde insertar en la lista entera para que quede en el lugar `index` de `inside`. */
function insertionPoint(rest: VaultItem[], inside: VaultItem[], index: number, fallback: number): number {
  if (index < inside.length) return rest.indexOf(inside[index]);
  if (inside.length) return rest.indexOf(inside[inside.length - 1]) + 1;
  return Math.min(fallback, rest.length);
}

function isIn(item: VaultItem, shelfId: string | null, known: Set<string>) {
  return shelfId ? item.shelfId === shelfId : !item.shelfId || !known.has(item.shelfId);
}

/** Lo que llega a un lugar: a un mueble, al final (o al lado de sus hermanas); a "Sin ubicar", primero. */
function arrive(list: VaultItem[], item: VaultItem, known: Set<string>): VaultItem[] {
  const rest = list.filter((i) => i.id !== item.id);
  if (!item.shelfId) return [item, ...rest];
  const inside = rest.filter((i) => isIn(i, item.shelfId, known));
  const index = siblingIndex(inside, item.externalId, item.attributes.season) ?? inside.length;
  const at = insertionPoint(rest, inside, index, rest.length);
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

function knownShelf(data: VaultData, shelfId: string | null | undefined): string | null {
  return shelfId && data.shelves.some((s) => s.id === shelfId) ? shelfId : null;
}

export function applyOp(data: VaultData, op: Op): VaultData {
  const known = new Set(data.shelves.map((s) => s.id));
  switch (op.kind) {
    case "createItem": {
      if (data.items.some((i) => i.id === op.id)) return data;
      const parsed = itemSchema.safeParse(op.input);
      if (!parsed.success) return data;
      const sticker = pickSticker(data.stickers, parsed.data.stickerId, parsed.data.type);
      if (!sticker) return data;
      const item: VaultItem = {
        id: op.id,
        ...values(parsed.data, sticker.base),
        stickerId: sticker.id,
        shelfId: knownShelf(data, parsed.data.shelfId),
        translations: {},
        position: 0,
        // Todavía sin número: lo da el server al guardarlo (`inventoryLabel` muestra "—").
        inventoryNumber: 0,
      };
      return { ...data, items: arrive(data.items, item, known) };
    }

    case "updateItem": {
      const current = data.items.find((i) => i.id === op.id);
      const parsed = itemSchema.safeParse(op.input);
      if (!current || !parsed.success) return data;
      const sticker = pickSticker(data.stickers, parsed.data.stickerId, parsed.data.type);
      if (!sticker) return data;
      const next = values(parsed.data, sticker.base);
      const shelfId = knownShelf(data, parsed.data.shelfId);
      // Como el server: lo cargado en el formulario pisa el idioma de quien lo cargó.
      const sameTitle = current.externalId === next.externalId && current.attributes.season === next.attributes.season;
      const locale = op.locale as keyof ItemTranslations;
      const translations: ItemTranslations = !next.externalSource
        ? {}
        : sameTitle
          ? {
              ...current.translations,
              [locale]: {
                ...current.translations[locale],
                name: next.name,
                description: next.description,
                genre: next.attributes.genre ?? null,
                coverRef: next.coverSource === "tmdb" ? next.coverRef : (current.translations[locale]?.coverRef ?? null),
              },
            }
          : {};
      const item: VaultItem = { ...current, ...next, stickerId: sticker.id, shelfId, translations };
      if (current.shelfId !== shelfId) return { ...data, items: arrive(data.items, item, known) };
      return { ...data, items: data.items.map((i) => (i.id === op.id ? item : i)) };
    }

    case "deleteItem":
      return data.items.some((i) => i.id === op.id) ? { ...data, items: data.items.filter((i) => i.id !== op.id) } : data;

    case "placeItem": {
      const moving = data.items.find((i) => i.id === op.id);
      if (!moving || (op.shelfId && !known.has(op.shelfId))) return data;
      const rest = data.items.filter((i) => i.id !== op.id);
      const inside = rest.filter((i) => isIn(i, op.shelfId, known));
      const at = insertionPoint(rest, inside, Math.min(op.index, inside.length), data.items.indexOf(moving));
      const moved = { ...moving, shelfId: op.shelfId };
      return { ...data, items: [...rest.slice(0, at), moved, ...rest.slice(at)] };
    }

    case "reorderItems": {
      // Lo que se reordena toma los lugares que ya ocupaba, en el orden nuevo; lo demás no se mueve.
      const ids = new Set(op.ids);
      if (ids.size !== op.ids.length) return data;
      const byId = new Map(data.items.map((i) => [i.id, i]));
      if (op.ids.some((id) => !byId.has(id))) return data;
      const queue = op.ids.map((id) => byId.get(id)!);
      return { ...data, items: data.items.map((i) => (ids.has(i.id) ? queue.shift()! : i)) };
    }

    case "createShelf": {
      const parsed = shelfSchema.safeParse(op.input);
      if (known.has(op.id) || !parsed.success || data.shelves.some((s) => s.name === parsed.data.name)) return data;
      const position = Math.max(0, ...data.shelves.map((s) => s.position)) + 1;
      return { ...data, shelves: [...data.shelves, { id: op.id, name: parsed.data.name, kind: parsed.data.kind, position, count: 0 }] };
    }

    case "updateShelf": {
      const parsed = shelfSchema.safeParse(op.input);
      if (!known.has(op.id) || !parsed.success || data.shelves.some((s) => s.id !== op.id && s.name === parsed.data.name)) return data;
      return { ...data, shelves: data.shelves.map((s) => (s.id === op.id ? { ...s, name: parsed.data.name, kind: parsed.data.kind } : s)) };
    }

    case "deleteShelf":
      if (!known.has(op.id)) return data;
      return {
        ...data,
        shelves: data.shelves.filter((s) => s.id !== op.id),
        items: data.items.map((i) => (i.shelfId === op.id ? { ...i, shelfId: null } : i)),
      };

    case "createSticker": {
      const parsed = stickerSchema.safeParse(op.input);
      if (data.stickers.some((s) => s.id === op.id) || !parsed.success) return data;
      const position = Math.max(-1, ...data.stickers.map((s) => s.position)) + 1;
      return { ...data, stickers: [...data.stickers, { id: op.id, ...parsed.data, position, count: 0 }] };
    }

    case "updateSticker": {
      const parsed = stickerSchema.safeParse(op.input);
      const current = data.stickers.find((s) => s.id === op.id);
      if (!current || !parsed.success) return data;
      if (current.base !== parsed.data.base && data.items.some((i) => i.stickerId === op.id)) return data;
      return { ...data, stickers: data.stickers.map((s) => (s.id === op.id ? { ...s, ...parsed.data } : s)) };
    }

    case "deleteSticker": {
      const current = data.stickers.find((s) => s.id === op.id);
      if (!current) return data;
      const used = data.items.some((i) => i.stickerId === op.id);
      const target = data.stickers.find((s) => s.id === op.moveTo && s.id !== op.id);
      if (used && (!target || target.base !== current.base)) return data;
      return {
        ...data,
        stickers: data.stickers.filter((s) => s.id !== op.id),
        items: used ? data.items.map((i) => (i.stickerId === op.id ? { ...i, stickerId: target!.id } : i)) : data.items,
      };
    }
  }
}

/* ---------------------------------------------------------------- validación */

/** El error que daría el server, o `null` si va a entrar. Mismos textos que las actions. */
export function validateOp(data: VaultData, op: Op, t: Messages): string | null {
  switch (op.kind) {
    case "createItem":
    case "updateItem": {
      if (op.kind === "updateItem" && !data.items.some((i) => i.id === op.id)) return t.errors.itemMissing;
      const parsed = itemSchema.safeParse(op.input);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return field === "name" ? t.errors.nameMissing : field === "type" ? t.errors.badType : t.errors.invalid;
      }
      if (!pickSticker(data.stickers, parsed.data.stickerId, parsed.data.type)) return t.errors.stickerMissing;
      if (parsed.data.shelfId && !data.shelves.some((s) => s.id === parsed.data.shelfId)) return t.errors.containerMissing;
      return null;
    }
    case "deleteItem":
      return data.items.some((i) => i.id === op.id) ? null : t.errors.itemMissing;
    case "placeItem":
      if (!data.items.some((i) => i.id === op.id)) return t.errors.itemMissing;
      return op.shelfId && !data.shelves.some((s) => s.id === op.shelfId) ? t.errors.containerMissing : null;
    case "reorderItems":
      return op.ids.every((id) => data.items.some((i) => i.id === id)) ? null : t.errors.itemsMissing;
    case "createShelf":
    case "updateShelf": {
      if (op.kind === "updateShelf" && !data.shelves.some((s) => s.id === op.id)) return t.errors.containerMissing;
      const parsed = shelfSchema.safeParse(op.input);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return issue?.path[0] === "kind" ? t.errors.badKind : issue?.code === "too_big" ? t.errors.containerName : t.errors.nameMissing;
      }
      return data.shelves.some((s) => s.id !== op.id && s.name === parsed.data.name) ? t.errors.duplicateContainer : null;
    }
    case "deleteShelf":
      return data.shelves.some((s) => s.id === op.id) ? null : t.errors.containerMissing;
    case "createSticker":
    case "updateSticker": {
      const current = data.stickers.find((s) => s.id === op.id);
      if (op.kind === "updateSticker" && !current) return t.errors.stickerMissing;
      const parsed = stickerSchema.safeParse(op.input);
      if (!parsed.success) {
        const field = parsed.error.issues[0]?.path[0];
        return field === "color" ? t.errors.stickerColor : field === "name" ? t.errors.stickerName : t.errors.badKind;
      }
      if (current && current.base !== parsed.data.base && data.items.some((i) => i.stickerId === op.id)) return t.errors.stickerBaseLocked;
      return null;
    }
    case "deleteSticker": {
      const current = data.stickers.find((s) => s.id === op.id);
      if (!current) return t.errors.stickerMissing;
      if (!data.items.some((i) => i.stickerId === op.id)) return null;
      const target = data.stickers.find((s) => s.id === op.moveTo && s.id !== op.id);
      if (!target) return t.errors.stickerInUse;
      return target.base !== current.base ? t.errors.stickerMoveBase : null;
    }
  }
}
