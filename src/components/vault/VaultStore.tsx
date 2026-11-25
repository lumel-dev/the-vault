"use client";

/**
 * La colección que ve la app y la única forma de cambiarla (`mutate`). Ver `src/lib/offline/`.
 *
 * - **Base**: la última colección del server. Es la de la página o, si la guardada en IndexedDB es
 *   más nueva (se abrió sin señal y el service worker sirvió una página vieja), la guardada. Se
 *   comparan por `renderedAt`, la hora del server: no depende del reloj del teléfono.
 * - **Cola**: los cambios que el server todavía no confirmó, o que confirmó pero la base aún no
 *   trae. Lo que se ve es la base con la cola aplicada (`applyOps`).
 * - `mutate` valida (`validateOp`), encola y manda. Con señal, el server confirma enseguida y la
 *   app pide la colección nueva (`router.refresh()`); sin señal, queda en la cola hasta que vuelva.
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { inventoryLabel } from "@/lib/containers";
import { useI18n } from "@/lib/i18n/client";
import { applyOps, validateOp, type VaultData } from "@/lib/offline/apply";
import { deleteQueued, putQueued, readQueue, readSnapshot, saveSnapshot } from "@/lib/offline/idb";
import type { Op, OpResult, QueuedOp } from "@/lib/offline/ops";
import { nextSeq, notifyOthers, onOthersChange, sync, type SyncOutcome } from "@/lib/offline/sync";

/** Con cosas por subir, se reintenta cada tanto mientras la app esté abierta. */
const RETRY_MS = 20_000;

export interface SyncStatus {
  online: boolean;
  /** Cambios que el server todavía no confirmó. */
  pending: number;
  /** La sesión venció: hasta volver a entrar no se puede subir nada. */
  sessionExpired: boolean;
}

interface Store {
  data: ReturnType<typeof applyOps>;
  /** Valida, aplica y encola. `false` si no pasa la validación (ya avisó con un toast). */
  mutate: (op: Op) => boolean;
  status: SyncStatus;
}

const Ctx = createContext<Store | null>(null);

export function useVault(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("useVault fuera de VaultStoreProvider");
  return store;
}

export function VaultStoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

interface Props extends VaultData {
  userId: string;
  /** Cuándo armó el server esta colección (ms). */
  renderedAt: number;
}

export function useVaultStore({ userId, renderedAt, items, shelves, stickers }: Props): Store {
  const router = useRouter();
  const { t } = useI18n();
  const [base, setBase] = useState<{ data: VaultData; renderedAt: number }>({ data: { items, shelves, stickers }, renderedAt });
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Cuándo se pidió la última colección nueva: lo enviado antes ya viene en ella. */
  const refreshAt = useRef(0);

  // Llegó una colección nueva del server (al abrir o tras `router.refresh()`).
  const [prevRendered, setPrevRendered] = useState(renderedAt);
  if (renderedAt !== prevRendered) {
    setPrevRendered(renderedAt);
    if (renderedAt > base.renderedAt) setBase({ data: { items, shelves, stickers }, renderedAt });
  }

  const reloadQueue = useCallback(async () => {
    const all = await readQueue();
    setQueue(all.filter((q) => q.userId === userId).sort((a, b) => a.seq - b.seq));
  }, [userId]);

  /** Guarda la colección del server y suelta lo enviado que ya viene en ella. */
  const adoptServer = useEffectEvent(async (sentBefore: number) => {
    await saveSnapshot({ userId, renderedAt, data: { items, shelves, stickers } });
    const done = (await readQueue()).filter((q) => q.userId === userId && q.status === "sent" && (q.sentAt ?? 0) <= sentBefore);
    if (done.length) await deleteQueued(done.map((q) => q.seq));
    await reloadQueue();
  });

  const onResults = useEffectEvent((results: OpResult[], sent: QueuedOp[]) => {
    const bySeq = new Map(sent.map((q) => [q.seq, q]));
    for (const r of results) {
      const q = bySeq.get(r.seq);
      if (!q) continue;
      if (r.result === "rejected") toast.error(r.error);
      // El número es para escribirlo en el lomo real: llega cuando el server guardó el objeto.
      if (r.result === "applied" && r.inventoryNumber && q.op.kind === "createItem") {
        toast.success(t.toast.created(String(q.op.input.name ?? "").trim(), inventoryLabel(r.inventoryNumber, t)));
      }
    }
  });

  const runSync = useEffectEvent(async () => {
    const outcome: SyncOutcome = await sync(userId, onResults);
    setOnline(outcome !== "offline");
    setSessionExpired(outcome === "session");
    await reloadQueue();
    const queued = await readQueue();
    if (outcome !== "offline" && queued.some((q) => q.userId === userId && q.status === "sent")) {
      refreshAt.current = Date.now();
      router.refresh();
    }
  });

  // `mutate` corre en un handler, donde no se puede llamar a un Effect Event.
  const syncSoon = useRef<() => void>(() => {});
  useEffect(() => {
    syncSoon.current = () => void runSync();
  });

  // Al abrir: la colección más nueva entre la de la página y la guardada, y lo que quedó en la cola.
  useEffect(() => {
    void (async () => {
      const snapshot = await readSnapshot();
      if (snapshot && snapshot.userId === userId && snapshot.renderedAt > renderedAt) {
        setBase({ data: snapshot.data, renderedAt: snapshot.renderedAt });
        await reloadQueue();
      } else {
        // La página viene del server ahora: trae todo lo enviado antes de pedirla.
        await adoptServer(performance.timeOrigin);
      }
      setOnline(navigator.onLine);
      void runSync();
    })();
    // Sólo al montar: las colecciones nuevas entran por el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada colección nueva del server (después de subir cambios).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void adoptServer(refreshAt.current);
  }, [renderedAt]);

  // Al volver la señal, al volver a la pestaña, cada tanto con cosas pendientes, y cuando otra
  // pestaña cambia la cola.
  const pending = queue.filter((q) => q.status === "pending").length;
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void runSync();
    };
    const goOffline = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", visible);
    const stop = onOthersChange(() => void reloadQueue());
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", visible);
      stop();
    };
  }, [reloadQueue]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void runSync(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [pending]);

  const data = useMemo(() => applyOps(base.data, queue.map((q) => q.op)), [base, queue]);

  function mutate(op: Op): boolean {
    const error = validateOp(data, op, t);
    if (error) {
      toast.error(error);
      return false;
    }
    const queued: QueuedOp = { seq: nextSeq(), userId, op, createdAt: Date.now(), status: "pending" };
    setQueue((q) => [...q, queued]);
    void putQueued(queued).then(() => {
      notifyOthers();
      syncSoon.current();
    });
    return true;
  }

  return { data, mutate, status: { online, pending, sessionExpired } };
}
