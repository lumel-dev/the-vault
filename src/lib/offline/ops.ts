/**
 * Todo lo que cambia la colección, como datos. El browser los guarda en una cola (IndexedDB), los
 * aplica al instante sobre su copia (`apply.ts`) y los manda a `/api/sync`, que los aplica con
 * las mismas server actions de siempre (`server.ts`). Haya señal o no, es el único camino para
 * escribir: así el modo sin señal no es un caso raro que se prueba poco.
 *
 * Lo que se crea lleva el id que generó el browser y las actions lo aceptan sin duplicar: reenviar
 * un cambio que ya había entrado no hace nada. Por eso la cola puede reintentar sin miedo.
 */
import { z } from "zod";
import type { ItemInput, ShelfInput, StickerInput } from "@/lib/schemas";

export type Op =
  | { kind: "createItem"; id: string; input: ItemInput }
  | { kind: "updateItem"; id: string; input: ItemInput; locale: string }
  | { kind: "deleteItem"; id: string }
  /** Contenedor y lugar dentro de lo que tiene (sin contar el que se mueve). Mover = al final o al principio. */
  | { kind: "placeItem"; id: string; shelfId: string | null; index: number }
  | { kind: "reorderItems"; ids: string[] }
  | { kind: "createShelf"; id: string; input: ShelfInput }
  | { kind: "updateShelf"; id: string; input: ShelfInput }
  | { kind: "deleteShelf"; id: string }
  | { kind: "createSticker"; id: string; input: StickerInput }
  | { kind: "updateSticker"; id: string; input: StickerInput }
  | { kind: "deleteSticker"; id: string; moveTo: string | null };

export type OpKind = Op["kind"];

/** El lugar "al final" de un contenedor: más de lo que puede tener. Igual que `MAX_INDEX` del server. */
export const LAST = 5000;

/** Un cambio en la cola. `seq` es la clave y el orden de envío. */
export type QueuedOp = {
  seq: number;
  /** Quién lo hizo: sólo se manda con la sesión de esa persona. */
  userId: string;
  op: Op;
  createdAt: number;
  /**
   * - `pending`: falta mandarlo.
   * - `sent`: el server lo confirmó, pero la colección que tiene la página todavía no lo trae. Se
   *   sigue aplicando (si no, desaparecería hasta que llegue la nueva) y se borra cuando llega.
   */
  status: "pending" | "sent";
  sentAt?: number;
};

/**
 * Lo que contesta el server por cada cambio:
 * - `applied`: entró (o ya había entrado). `data` trae, al crear un objeto, su número de inventario.
 * - `rejected`: no va a entrar nunca (se borró lo que tocaba, un dato no pasa). Se avisa y se descarta.
 * - `retry`: falló algo que no es del usuario. Queda para la próxima y el lote se corta ahí.
 * - `other_user`: lo hizo otra cuenta en este browser. Espera a que entre ella.
 */
export type OpResult =
  | { seq: number; result: "applied"; inventoryNumber?: number }
  | { seq: number; result: "rejected"; error: string }
  | { seq: number; result: "retry" }
  | { seq: number; result: "other_user" };

/* ---------------------------------------------------------- validación en el server */

const uuid = z.uuid();
// Los datos de cada formulario los valida la action; acá sólo la forma del sobre.
const input = z.record(z.string(), z.unknown());

export const opSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("createItem"), id: uuid, input }),
  z.object({ kind: z.literal("updateItem"), id: uuid, input, locale: z.string().max(5) }),
  z.object({ kind: z.literal("deleteItem"), id: uuid }),
  z.object({ kind: z.literal("placeItem"), id: uuid, shelfId: uuid.nullable(), index: z.number().int().min(0).max(LAST) }),
  z.object({ kind: z.literal("reorderItems"), ids: z.array(uuid).max(LAST) }),
  z.object({ kind: z.literal("createShelf"), id: uuid, input }),
  z.object({ kind: z.literal("updateShelf"), id: uuid, input }),
  z.object({ kind: z.literal("deleteShelf"), id: uuid }),
  z.object({ kind: z.literal("createSticker"), id: uuid, input }),
  z.object({ kind: z.literal("updateSticker"), id: uuid, input }),
  z.object({ kind: z.literal("deleteSticker"), id: uuid, moveTo: uuid.nullable() }),
]);

/** Un lote más grande que esto es un browser que manda cualquier cosa. */
export const MAX_BATCH = 50;

export const batchSchema = z.object({
  ops: z.array(z.object({ seq: z.number().int(), userId: uuid, op: opSchema })).max(MAX_BATCH),
});
