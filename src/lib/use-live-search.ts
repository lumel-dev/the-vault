"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

/**
 * Búsqueda que corre mientras se tipea: espera a que se deje de tipear (`delay`) y descarta las
 * respuestas que llegan tarde, para que una búsqueda vieja no pise los resultados de la última.
 * `now` busca sin esperar (Enter). Con `initialQuery`, busca eso al montarse (el buscador que
 * reaparece con lo que ya estaba escrito). `failed` queda en `true` si la última búsqueda no
 * llegó (sin señal): el buscador lo dice en vez de quedarse girando.
 */
export function useLiveSearch<T>(
  run: (query: string) => Promise<T>,
  onResult: (result: T) => void,
  { delay = 350, minLength = 2, initialQuery = "" }: { delay?: number; minLength?: number; initialQuery?: string } = {},
) {
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const searchInitial = useEffectEvent(() => {
    if (initialQuery) now(initialQuery);
  });

  useEffect(() => {
    searchInitial();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function now(query: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    const id = ++latest.current;
    if (q.length < minLength) {
      setSearching(false);
      return;
    }
    setSearching(true);
    void run(q)
      .then((result) => {
        if (id !== latest.current) return;
        setFailed(false);
        onResult(result);
      })
      .catch(() => {
        if (id === latest.current) setFailed(true);
      })
      .finally(() => {
        if (id === latest.current) setSearching(false);
      });
  }

  function schedule(query: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => now(query), delay);
  }

  return { searching, failed, schedule, now };
}
