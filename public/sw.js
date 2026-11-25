/*
 * Service worker de The Vault. Escrito a mano y sin dependencias, como el de erp-base: son unas
 * pocas reglas de `fetch` y un framework (Serwist, next-pwa) no compra nada a este tamaño.
 *
 * Qué guarda, para que la app abra y se use sin señal:
 *
 * - **Los estáticos de Next** (`/_next/static/`, con hash en el nombre) y los íconos: entre
 *   versiones, porque un chunk con hash nunca cambia de contenido.
 * - **La página de la bóveda** (`/`), la última que llegó del server. Se sirve **sólo si no hay
 *   red** (o el server da 5xx); con red siempre va la del server. Trae la colección de quien
 *   entró, así que: se guarda sólo si trae la marca `data-vault-shell` (no un login ni un error),
 *   y **se borra al pasar por `/login` o `/registro`** (y la app borra también su IndexedDB). La
 *   colección más nueva la tiene la app en IndexedDB; esta página es la cáscara que la abre.
 * - **Las tapas** de TMDB, Open Library y Cover Art Archive que ya se vieron, con techo de
 *   entradas. Sólo respuestas CORS: el 3D las usa de textura y una opaca no le sirve.
 *
 * Qué no toca: lo que no es GET (las Server Actions y `/api/sync` pasan derecho), `/api/*`, y los
 * pedidos RSC del router (`router.refresh()` trae la colección nueva; nunca de un caché).
 */

// La versión llega en la URL del registro (`RegisterServiceWorker`): cada deploy registra otra URL
// y el browser instala el worker nuevo.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `vault-${VERSION}`;
/** Sobreviven a un deploy: chunks con hash, la cáscara y las tapas. */
const STATIC = "vault-static";
const SHELL = "vault-shell";
const COVERS = "vault-covers";
const KEEP = [STATIC, SHELL, COVERS];

const SHELL_KEY = "/";
const SHELL_MARK = "data-vault-shell";
const OFFLINE_PAGE = "/offline.html";

const MAX_STATIC = 1500;
const MAX_COVERS = 2000;

const COVER_HOSTS = ["image.tmdb.org", "covers.openlibrary.org", "coverartarchive.org"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_PAGE, "/icons/icon-192.png"].map((u) => new Request(u, { cache: "reload" }))))
      // Sin la página de cortesía el resto anda igual: que no impida instalar el worker.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE && !KEEP.includes(n)).map((n) => caches.delete(n))))
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

/** Borra las entradas más viejas por encima del techo (`keys()` viene en orden de inserción). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

let putsSinceTrim = 0;
function store(name, request, response) {
  return caches
    .open(name)
    .then((cache) => cache.put(request, response))
    .then(() => {
      if (++putsSinceTrim >= 100) {
        putsSinceTrim = 0;
        return Promise.all([trim(STATIC, MAX_STATIC), trim(COVERS, MAX_COVERS)]);
      }
    })
    .catch(() => {});
}

/** Primero lo guardado; si no está, la red, y lo que llega bien se guarda. */
function cacheFirst(event, name, keep) {
  const { request } = event;
  return caches.match(request, { cacheName: name }).then(
    (hit) =>
      hit ||
      fetch(request)
        .then((response) => {
          if (keep(response)) event.waitUntil(store(name, request, response.clone()));
          return response;
        })
        // Sin esto, un chunk que no está y no llega deja el `respondWith` rechazado y el import()
        // del router colgado. Un error de red lo maneja Next como cualquier otra falla.
        .catch(() => Response.error()),
  );
}

/** Los chunks que nombra la página, para que abra sin señal aunque se haya visto una sola vez. */
async function cacheChunksOf(html) {
  const paths = new Set(html.match(/\/_next\/static\/[\w\-./~%]+\.(?:js|css|woff2)/g) || []);
  await cacheUrls([...paths]);
}

async function cacheUrls(urls) {
  const cache = await caches.open(STATIC);
  for (const url of urls) {
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      return;
    }
  }
}

/** Guarda la página de la bóveda, si es la de la bóveda (trae la marca). */
async function keepShell(response) {
  if (response.status !== 200 || response.type !== "basic" || response.redirected) return;
  try {
    const html = await response.text();
    if (!html.includes(SHELL_MARK)) return;
    const cache = await caches.open(SHELL);
    await cache.put(SHELL_KEY, new Response(html, { status: 200, statusText: "OK", headers: response.headers }));
    await cacheChunksOf(html);
  } catch {
    // Queda la anterior: nada que romper.
  }
}

function forgetShell() {
  return caches.delete(SHELL).catch(() => {});
}

/** La pantalla de "sin conexión", con 503: nada que no llegó del server pasa por una página real. */
function offline() {
  return caches.match(OFFLINE_PAGE).then((page) =>
    page
      ? new Response(page.body, { status: 503, statusText: "Service Unavailable", headers: page.headers })
      : new Response("Sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
  );
}

/** La bóveda: siempre la red; sin red (o con el server caído), la última guardada. */
async function vault(event) {
  const saved = () => caches.match(SHELL_KEY, { cacheName: SHELL });
  let response;
  try {
    response = await fetch(event.request);
  } catch {
    return (await saved()) || offline();
  }
  if (response.status >= 500) return (await saved()) || offline();
  // Si la sesión venció, el server redirige al login: la guardada ya no corresponde.
  if (response.redirected && new URL(response.url).pathname !== "/") event.waitUntil(forgetShell());
  else event.waitUntil(keepShell(response.clone()));
  return response;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  // La primera visita se cargó antes de que existiera el worker: la página pide que se guarde.
  if (data.type === "keep-shell") {
    event.waitUntil(
      fetch(SHELL_KEY, { credentials: "same-origin" })
        .then(keepShell)
        .catch(() => {}),
    );
  }
  if (data.type === "cache-urls" && Array.isArray(data.urls)) {
    const own = data.urls.filter((u) => typeof u === "string" && new URL(u, self.location.origin).pathname.startsWith("/_next/static/"));
    event.waitUntil(cacheUrls(own).catch(() => {}));
  }
  if (data.type === "forget-shell") event.waitUntil(forgetShell());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (COVER_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event, COVERS, (r) => r.ok && r.type === "cors"));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Pedidos del router de Next: traen datos y van siempre a la red.
  if (request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(event, STATIC, (r) => r.ok));
    return;
  }

  if (request.mode !== "navigate") return;
  // Un prefetch de documento (speculation rules) pasa derecho: devolverle la pantalla de cortesía
  // con 200 haría que el browser la use al abrir el link.
  const purpose = request.headers.get("Sec-Purpose") || request.headers.get("Purpose") || "";
  if (purpose.includes("prefetch")) return;

  if (url.pathname === "/") {
    event.respondWith(vault(event));
    return;
  }
  if (url.pathname === "/login" || url.pathname === "/registro") event.waitUntil(forgetShell());
  event.respondWith(
    fetch(request)
      .then((response) => (response.status >= 500 ? offline() : response))
      .catch(offline),
  );
});
