/**
 * IndexedDB de la bóveda: la última colección que mandó el server (para abrir sin señal) y la cola
 * de cambios. Sólo browser, sobre la API cruda: son dos almacenes y unas pocas operaciones.
 *
 * - `meta`: clave → valor. Guarda la colección (`snapshot`), que dice de quién es (`userId`).
 * - `queue`: los cambios, con `seq` como clave y como orden de envío.
 *
 * Si IndexedDB no está (ventana privada de algunos browsers, almacenamiento bloqueado) todo sigue
 * andando en memoria: la app funciona con señal y sólo se pierde lo pendiente al recargar.
 *
 * **Al entrar a `/login` se borra la colección** (`forgetCollection`): en un browser compartido,
 * el siguiente no ve la del anterior. La cola se borra sólo si no tiene nada pendiente.
 */
import type { VaultData } from "./apply";
import type { QueuedOp } from "./ops";

const NAME = "the-vault";
const VERSION = 1;

export type Snapshot = { userId: string; renderedAt: number; data: VaultData };

let opened: Promise<IDBDatabase> | null = null;
let broken = false;
const memory = { snapshot: null as Snapshot | null, queue: new Map<number, QueuedOp>() };

function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "seq" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Otra pestaña borró la base: se suelta la conexión para no bloquearla.
      db.onversionchange = () => {
        db.close();
        opened = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opened = null;
      reject(req.error);
    };
  });
  return opened;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Corre `fn` sobre un almacén; si IndexedDB falla, sobre la copia en memoria. */
async function withStore<T>(name: "meta" | "queue", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>, fallback: () => T): Promise<T> {
  if (broken || typeof indexedDB === "undefined") return fallback();
  try {
    const db = await open();
    return await fn(db.transaction(name, mode).objectStore(name));
  } catch {
    broken = true;
    return fallback();
  }
}

export function readSnapshot(): Promise<Snapshot | null> {
  return withStore(
    "meta",
    "readonly",
    async (s) => ((await request(s.get("snapshot"))) as Snapshot | undefined) ?? null,
    () => memory.snapshot,
  );
}

export function saveSnapshot(snapshot: Snapshot): Promise<void> {
  memory.snapshot = snapshot;
  return withStore("meta", "readwrite", async (s) => void (await request(s.put(snapshot, "snapshot"))), () => undefined);
}

export function readQueue(): Promise<QueuedOp[]> {
  return withStore(
    "queue",
    "readonly",
    async (s) => (await request(s.getAll())) as QueuedOp[],
    () => [...memory.queue.values()].sort((a, b) => a.seq - b.seq),
  );
}

export function putQueued(op: QueuedOp): Promise<void> {
  memory.queue.set(op.seq, op);
  return withStore("queue", "readwrite", async (s) => void (await request(s.put(op))), () => undefined);
}

export function deleteQueued(seqs: number[]): Promise<void> {
  for (const seq of seqs) memory.queue.delete(seq);
  return withStore(
    "queue",
    "readwrite",
    async (s) => {
      for (const seq of seqs) await request(s.delete(seq));
    },
    () => undefined,
  );
}

/** Al entrar a `/login`: la colección se va; la cola, sólo si no tiene nada por subir. */
export async function forgetCollection(): Promise<void> {
  memory.snapshot = null;
  await withStore("meta", "readwrite", async (s) => void (await request(s.delete("snapshot"))), () => undefined);
  const queue = await readQueue();
  const done = queue.filter((q) => q.status === "sent").map((q) => q.seq);
  if (done.length) await deleteQueued(done);
}
