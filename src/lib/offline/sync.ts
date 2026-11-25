/**
 * El envío de la cola a `/api/sync`. Sólo browser.
 *
 * - **Sólo se da por enviado lo confirmado.** Un cambio deja de estar pendiente cuando el server
 *   dice `applied`; si la respuesta se pierde, se reenvía, y el server lo reconoce por su id.
 * - **No hay sincronización en segundo plano**: Background Sync es sólo de Chrome. Se envía al
 *   encolar, al volver la señal, al abrir la app y cada tanto con la app abierta (`VaultStore`).
 * - Una sola corrida a la vez, también entre pestañas (`navigator.locks`).
 */
import { deleteQueued, putQueued, readQueue } from "./idb";
import { MAX_BATCH, type OpResult, type QueuedOp } from "./ops";

const TIMEOUT_MS = 30_000;

/** Avisa a las otras pestañas que la cola cambió. */
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("the-vault") : null;

export function notifyOthers() {
  channel?.postMessage("queue");
}

export function onOthersChange(fn: () => void): () => void {
  const listener = () => fn();
  channel?.addEventListener("message", listener);
  return () => channel?.removeEventListener("message", listener);
}

/** Un `seq` que crece siempre, aunque se encolen dos cosas en el mismo milisegundo. */
let lastSeq = 0;
export function nextSeq(): number {
  lastSeq = Math.max(Date.now() * 1000, lastSeq + 1);
  return lastSeq;
}

export type SyncOutcome = "ok" | "offline" | "session" | "error";

/**
 * Sin nada que mandar, igual se pregunta si hay red: abierta desde el caché del service worker, la
 * app no tiene otra forma de saber que está sin señal (`navigator.onLine` dice `true` con wifi sin
 * internet, o con el server caído). `/api/health` no toca la base.
 */
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Manda lo pendiente de `userId`, de a lotes. `onResults` recibe lo que contestó el server por
 * cada lote (para avisar), después de que la cola ya quedó actualizada.
 */
async function sendAll(userId: string, onResults: (results: OpResult[], sent: QueuedOp[]) => void): Promise<SyncOutcome> {
  const skipped = new Set<number>();
  for (let round = 0; ; round++) {
    const pending = (await readQueue())
      .filter((q) => q.status === "pending" && q.userId === userId && !skipped.has(q.seq))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, MAX_BATCH);
    if (!pending.length) return round > 0 || (await reachable()) ? "ok" : "offline";

    let res: Response;
    try {
      res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: pending.map(({ seq, userId, op }) => ({ seq, userId, op })) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return "offline";
    }
    if (res.status === 401) return "session";
    if (!res.ok) return "error";

    const { results } = (await res.json()) as { results: OpResult[] };
    const bySeq = new Map(pending.map((q) => [q.seq, q]));
    const now = Date.now();
    for (const r of results) {
      const q = bySeq.get(r.seq);
      if (!q) continue;
      if (r.result === "applied") await putQueued({ ...q, status: "sent", sentAt: now });
      else if (r.result === "rejected") await deleteQueued([q.seq]);
      else if (r.result === "other_user") skipped.add(q.seq);
    }
    notifyOthers();
    onResults(results, pending);
    if (results.some((r) => r.result === "retry") || results.length === 0) return "error";
  }
}

let running: Promise<SyncOutcome> | null = null;

export function sync(userId: string, onResults: (results: OpResult[], sent: QueuedOp[]) => void): Promise<SyncOutcome> {
  running ??= (async () => {
    try {
      if (navigator.locks) {
        return await navigator.locks.request("the-vault-sync", { ifAvailable: true }, (lock) =>
          lock ? sendAll(userId, onResults) : ("ok" as const),
        );
      }
      return await sendAll(userId, onResults);
    } finally {
      running = null;
    }
  })();
  return running;
}
