"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/addons/controls/OrbitControls.js";
import { coverUrl } from "@/lib/covers";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { buildLayout, frontNormal, slotIndex, toLocal, toWorld, type PlacedContainer, type PlacedItem, type SceneLayout, type Slot } from "@/lib/scene-layout";
import {
  buildSpineAtlas,
  concreteTexture,
  kraftTexture,
  markerCross,
  markerArrow,
  PALETTE,
  spineColor,
  tapeLabel,
  woodTexture,
  type SpineAtlas,
} from "./textures";

export interface VaultSceneProps {
  shelves: VaultShelf[];
  items: VaultItem[];
  /** Lo que coincide con la búsqueda; `null` sin búsqueda. */
  matches: Set<string> | null;
  selectedId: string | null;
  focusContainer: string | null | "all";
  pendingDelete: Set<string>;
  onSelect: (id: string | null) => void;
  onSelectContainer: (id: string | null) => void;
  onPlace: (itemId: string, containerId: string | null, level: number, index: number) => void;
}

/* ------------------------------------------------------------- materiales */

interface Materials {
  kraft: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  arrow: THREE.MeshBasicMaterial;
  cross: THREE.MeshBasicMaterial;
  slot: THREE.MeshBasicMaterial;
  insert: THREE.MeshBasicMaterial;
  plastic: Record<string, THREE.MeshStandardMaterial>;
  pages: THREE.MeshStandardMaterial;
  baseboard: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
}

function useMaterials(): Materials {
  return useMemo(() => {
    const kraftMap = kraftTexture();
    const woodMap = woodTexture();
    const concrete = concreteTexture();
    const wallMap = concrete.clone();
    wallMap.repeat.set(8, 3);
    return {
      kraft: new THREE.MeshStandardMaterial({ map: kraftMap, roughness: 0.95 }),
      wood: new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.7 }),
      woodDark: new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.75 }),
      floor: new THREE.MeshStandardMaterial({ map: concrete, color: "#bdbcb5", roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ map: wallMap, roughness: 1 }),
      arrow: new THREE.MeshBasicMaterial({ map: markerArrow(), transparent: true, depthWrite: false }),
      cross: new THREE.MeshBasicMaterial({ map: markerCross(), transparent: true, depthWrite: false }),
      slot: new THREE.MeshBasicMaterial({ color: PALETTE.tape, transparent: true, opacity: 0.45, depthWrite: false }),
      insert: new THREE.MeshBasicMaterial({ color: PALETTE.markerRed }),
      plastic: {
        case: new THREE.MeshStandardMaterial({ color: "#141415", roughness: 0.38 }),
        bluray: new THREE.MeshStandardMaterial({ color: "#1b4f9c", roughness: 0.3 }),
        vhs: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.85 }),
        jewel: new THREE.MeshStandardMaterial({ color: "#c7d0d6", roughness: 0.12, metalness: 0.1 }),
        cassette: new THREE.MeshStandardMaterial({ color: "#2b2b2c", roughness: 0.3 }),
      },
      pages: new THREE.MeshStandardMaterial({ color: "#ece3cf", roughness: 0.95 }),
      baseboard: new THREE.MeshStandardMaterial({ color: "#b4b3ad", roughness: 0.9 }),
      // El fondo del mueble, un poco más claro que la madera: si no, el interior es un pozo negro.
      back: new THREE.MeshStandardMaterial({ map: woodMap, color: "#a99683", roughness: 0.85 }),
    };
  }, []);
}

/* ------------------------------------------------------------------ escena */

export default function VaultScene(props: VaultSceneProps) {
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  return (
    <Canvas
      frameloop="demand"
      shadows={!coarse}
      dpr={[1, coarse ? 1.5 : 2]}
      camera={{ fov: 34, near: 0.05, far: 80, position: [4, 2.5, 4] }}
      onPointerMissed={() => props.onSelect(null)}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      aria-label="Los muebles de la colección en 3D. Para hacer todo con teclado, usá la vista Grilla."
    >
      <color attach="background" args={[PALETTE.concrete]} />
      <fog attach="fog" args={[PALETTE.concrete, 9, 26]} />
      <Contents {...props} coarse={coarse} />
    </Canvas>
  );
}

function Contents({ shelves, items, matches, selectedId, focusContainer, pendingDelete, onSelect, onSelectContainer, onPlace, coarse }: VaultSceneProps & { coarse: boolean }) {
  const mats = useMaterials();
  const layout = useMemo(() => buildLayout(shelves, items), [shelves, items]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const atlas = useAtlas(items, layout);
  const [drag, setDrag] = useState<{ id: string; point: THREE.Vector3; target: { slot: Slot; index: number } | null } | null>(null);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  const placedById = useMemo(() => new Map(layout.items.map((p) => [p.id, p])), [layout]);
  const containerById = useMemo(() => new Map(layout.containers.map((c) => [c.id, c])), [layout]);
  const itemsByContainer = useMemo(() => {
    const out = new Map<string | null, PlacedItem[]>();
    for (const p of layout.items) out.set(p.containerId, [...(out.get(p.containerId) ?? []), p]);
    return out;
  }, [layout]);
  const matchedPlaced = useMemo(
    () => (matches ? layout.items.filter((p) => matches.has(p.id)) : []),
    [matches, layout],
  );

  // La cámara va a lo encontrado recién después de un momento: primero se ve cómo se apaga el
  // resto de la casa en su lugar, que es lo que dice que no se movió nada.
  const [settledMatches, setSettledMatches] = useState<PlacedItem[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => setSettledMatches(matchedPlaced), matchedPlaced.length ? 900 : 0);
    return () => window.clearTimeout(t);
  }, [matchedPlaced]);

  // Puertas abiertas: el mueble elegido, el que tiene lo que se buscó o lo elegido, y todos al arrastrar.
  const openContainers = useMemo(() => {
    const open = new Set<string | null>();
    if (focusContainer !== "all") open.add(focusContainer);
    for (const p of matchedPlaced) open.add(p.containerId);
    const sel = selectedId ? placedById.get(selectedId) : undefined;
    if (sel) open.add(sel.containerId);
    return open;
  }, [focusContainer, matchedPlaced, selectedId, placedById]);

  const extent = Math.max(layout.leftLength, layout.backLength) + 1;

  return (
    <>
      <hemisphereLight args={["#ffffff", "#b9b4a8", 1.35]} />
      {/* luz suave desde el medio de la habitación: deja leer los lomos en las dos paredes */}
      <directionalLight position={[extent * 0.6, 1.4, extent * 0.6]} intensity={0.55} />
      <directionalLight
        position={[extent * 0.75, 4.5, extent * 0.55]}
        intensity={1.6}
        castShadow={!coarse}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
      />
      <Room layout={layout} mats={mats} />

      {layout.containers.map((c) => {
        const target = drag?.target?.slot.containerId === c.id ? drag.target : null;
        return (
          // Cada mueble se dibuja en sus coordenadas de fila y este grupo lo lleva a su pared.
          <group key={c.id ?? "loose"} position={c.origin} rotation={[0, c.rotationY, 0]}>
            <group position={[-c.x, 0, 0]}>
              <Furniture container={c} mats={mats} open={drag !== null || openContainers.has(c.id)} onSelect={() => onSelectContainer(c.id)} />
              {atlas &&
                (itemsByContainer.get(c.id) ?? []).map((p) => {
                  const item = itemById.get(p.id);
                  if (!item) return null;
                  const dragging = drag?.id === p.id;
                  return (
                    <ItemMesh
                      key={p.id}
                      placed={p}
                      item={item}
                      atlas={atlas}
                      mats={mats}
                      // Lo elegido nunca se apaga: si no coincide con la búsqueda, su tapa quedaba casi invisible.
                      dim={matches !== null && !matches.has(p.id) && selectedId !== p.id}
                      matched={matches !== null && matches.has(p.id)}
                      selected={selectedId === p.id}
                      striking={pendingDelete.has(p.id)}
                      dragging={dragging}
                      dragPoint={dragging && drag ? new THREE.Vector3(...toLocal(c, drag.point.toArray() as [number, number, number])) : null}
                      castShadow={!coarse}
                      onPress={(e) => startPress(e, p.id)}
                    />
                  );
                })}
              {target && <DropHint target={target} mats={mats} />}
            </group>
          </group>
        );
      })}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={0.35}
        maxDistance={16}
        minPolarAngle={0.55}
        maxPolarAngle={1.62}
        // De frente a la pared del fondo (0) hasta de frente a la de la izquierda (90°).
        minAzimuthAngle={-0.3}
        maxAzimuthAngle={Math.PI / 2 + 0.3}
        screenSpacePanning
      />
      <CameraRig
        layout={layout}
        containerById={containerById}
        focusContainer={focusContainer}
        matched={settledMatches}
        selected={selectedId ? placedById.get(selectedId) ?? null : null}
      />
    </>
  );

  /* Arrastrar: con mouse arranca a los 6 px; con el dedo, después de mantener apretado 250 ms
   * (si no, deslizar el dedo mueve la cámara, como en cualquier visor 3D). Soltar sin haber
   * arrastrado es un click: elige el objeto. */
  function startPress(e: ThreeEvent<PointerEvent>, id: string) {
    e.stopPropagation();
    const native = e.nativeEvent;
    const start = { x: native.clientX, y: native.clientY, t: performance.now() };
    const touch = native.pointerType !== "mouse";
    let started = false;
    let cancelled = false;
    if (!touch && controls) controls.enabled = false;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const camera = e.camera;
    const dom = (e.nativeEvent.target as HTMLElement) ?? document.body;
    const grabbed = placedById.get(id);
    const grabbedWorld = grabbed ? new THREE.Vector3(...toWorld(containerById.get(grabbed.containerId)!, grabbed.position)) : new THREE.Vector3();

    /**
     * Los muebles miran a dos paredes distintas, así que no hay un único plano de arrastre: se
     * prueba el frente de cada estante, en las coordenadas de su mueble, y gana el más cercano a
     * la cámara. Fuera de todo estante, el objeto sigue al puntero a la distancia de donde salió.
     */
    const project = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      let best: { t: number; slot: Slot; x: number } | null = null;
      for (const slot of layout.slots) {
        const c = containerById.get(slot.containerId);
        if (!c) continue;
        const o = toLocal(c, ray.origin.toArray() as [number, number, number]);
        const far = toLocal(c, ray.at(1, new THREE.Vector3()).toArray() as [number, number, number]);
        const dz = far[2] - o[2];
        if (Math.abs(dz) < 1e-6) continue;
        const t = (slot.z - o[2]) / dz;
        if (t <= 0 || (best && t >= best.t)) continue;
        const x = o[0] + (far[0] - o[0]) * t;
        const y = o[1] + (far[1] - o[1]) * t;
        if (x < slot.x0 || x > slot.x1 || y < slot.y0 || y > slot.y1) continue;
        best = { t, slot, x };
      }
      if (best) {
        const point = ray.at(best.t, new THREE.Vector3());
        // El objeto flota apenas delante del estante, hacia la cámara.
        point.add(camera.position.clone().sub(point).normalize().multiplyScalar(0.12));
        return { point, target: { slot: best.slot, index: slotIndex(best.slot, best.x) } };
      }
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), grabbedWorld);
      const hit = ray.intersectPlane(plane, new THREE.Vector3());
      return hit ? { point: hit, target: null } : null;
    };

    const begin = (clientX: number, clientY: number) => {
      started = true;
      if (controls) controls.enabled = false;
      const p = project(clientX, clientY);
      setDrag({ id, point: p?.point ?? grabbedWorld.clone(), target: p?.target ?? null });
    };

    const longPress = touch ? window.setTimeout(() => !cancelled && begin(start.x, start.y), 250) : 0;

    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!started) {
        if (touch) {
          if (dist > 8) cancelled = true;
          return;
        }
        if (dist < 6) return;
        begin(ev.clientX, ev.clientY);
      }
      const p = project(ev.clientX, ev.clientY);
      if (p) setDrag({ id, point: p.point, target: p.target });
    };

    const up = (ev: PointerEvent) => {
      window.clearTimeout(longPress);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (controls) controls.enabled = true;
      if (!started) {
        if (!cancelled && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) onSelect(id === selectedId ? null : id);
        return;
      }
      setDrag(null);
      // Soltar casi donde se agarró no mueve nada: si no, un toque largo sin arrastrar podía caer
      // en el estante de otro mueble que el rayo cruza antes (en la L, los muebles se superponen).
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 12) return;
      const target = project(ev.clientX, ev.clientY)?.target ?? null;
      if (!target) return;
      const from = placedById.get(id);
      let index = target.index;
      // Dentro del mismo estante, el lugar se cuenta sin el objeto que se mueve.
      if (from && from.containerId === target.slot.containerId && from.level === target.slot.level && from.index < index) index -= 1;
      if (from && from.containerId === target.slot.containerId && from.level === target.slot.level && from.index === index) return;
      onPlace(id, target.slot.containerId, target.slot.level, index);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
}

/* --------------------------------------------------------------- atlas */

function useAtlas(items: VaultItem[], layout: SceneLayout): SpineAtlas | null {
  const [atlas, setAtlas] = useState<SpineAtlas | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const key = useMemo(
    () => items.map((i) => `${i.id}:${i.name}:${i.type}:${i.attributes.season ?? ""}:${i.attributes.format ?? ""}:${i.attributes.discs ?? ""}`).join("|"),
    [items],
  );

  useEffect(() => {
    let alive = true;
    // Los lomos se dibujan con las fuentes de la app: hay que esperar a que estén cargadas.
    void document.fonts.ready.then(() => {
      if (!alive) return;
      const placed = new Map(layout.items.map((p) => [p.id, p]));
      const next = buildSpineAtlas(
        items
          .filter((i) => placed.has(i.id))
          .map((i) => ({
            id: i.id,
            name: i.name,
            type: i.type,
            shape: placed.get(i.id)!.shape,
            dims: placed.get(i.id)!.dims,
            inventoryNumber: i.inventoryNumber,
            badge: i.type === "series" && i.attributes.season ? `T${i.attributes.season}` : undefined,
          })),
      );
      setAtlas((prev) => {
        prev?.pages.forEach((p) => p.dispose());
        return next;
      });
      invalidate();
    });
    return () => {
      alive = false;
    };
    // `key` resume lo que cambia un lomo; el layout solo no cambia lo que se dibuja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return atlas;
}

/* ------------------------------------------------------------------ objetos */

/**
 * La versión apagada de un material, cacheada: muchos objetos comparten el mismo plástico y no se
 * puede oscurecer el original sin oscurecerlos a todos.
 */
const dimCache = new WeakMap<THREE.Material, THREE.Material>();
function dimmed(m: THREE.Material): THREE.Material {
  const hit = dimCache.get(m);
  if (hit) return hit;
  const copy = m.clone() as THREE.MeshStandardMaterial;
  if (copy.color) copy.color.multiplyScalar(0.45).lerp(new THREE.Color(PALETTE.concrete), 0.55);
  copy.transparent = true;
  copy.opacity = 0.3;
  dimCache.set(m, copy);
  return copy;
}

/** Geometría de caja con la cara del lomo (+z) apuntando a su celda del atlas. */
function spineGeometry(t: number, h: number, d: number, cell: { u0: number; v0: number; u1: number; v1: number }) {
  const g = new THREE.BoxGeometry(t, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  // Cara +z: vértices 16..19 (arriba-izq, arriba-der, abajo-izq, abajo-der).
  uv.setXY(16, cell.u0, cell.v1);
  uv.setXY(17, cell.u1, cell.v1);
  uv.setXY(18, cell.u0, cell.v0);
  uv.setXY(19, cell.u1, cell.v0);
  uv.needsUpdate = true;
  return g;
}

function ItemMesh({
  placed,
  item,
  atlas,
  mats,
  dim,
  matched,
  selected,
  striking,
  dragging,
  dragPoint,
  castShadow,
  onPress,
}: {
  placed: PlacedItem;
  item: VaultItem;
  atlas: SpineAtlas;
  mats: Materials;
  dim: boolean;
  matched: boolean;
  selected: boolean;
  striking: boolean;
  dragging: boolean;
  dragPoint: THREE.Vector3 | null;
  castShadow: boolean;
  onPress: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [hovered, setHovered] = useState(false);
  const { t, h, d } = placed.dims;
  const cell = atlas.cells.get(placed.id);
  const cover = useCover(selected ? item : null);

  const geometry = useMemo(() => (cell ? spineGeometry(t, h, d, cell) : new THREE.BoxGeometry(t, h, d)), [t, h, d, cell]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const materials = useMemo(() => {
    const page = cell ? atlas.pages[cell.page] : null;
    const spine = new THREE.MeshStandardMaterial({ map: page, roughness: placed.shape === "jewel" ? 0.2 : 0.55 });
    let body: THREE.Material;
    let edge: THREE.Material;
    switch (placed.shape) {
      case "book":
        body = new THREE.MeshStandardMaterial({ color: spineColor("book", item.name), roughness: 0.7 });
        edge = mats.pages;
        break;
      case "vinyl":
        body = new THREE.MeshStandardMaterial({ color: spineColor("vinyl", item.name), roughness: 0.8 });
        edge = body;
        break;
      case "parcel":
        body = mats.kraft;
        edge = mats.kraft;
        break;
      case "vhs":
        body = mats.plastic.vhs;
        edge = mats.plastic.vhs;
        break;
      case "jewel":
        body = mats.plastic.jewel;
        edge = mats.plastic.jewel;
        break;
      case "cassette":
        body = mats.plastic.cassette;
        edge = mats.plastic.cassette;
        break;
      default:
        body = item.attributes.format === "Blu-ray" ? mats.plastic.bluray : mats.plastic.case;
        edge = body;
    }
    const front = cover ? new THREE.MeshStandardMaterial({ map: cover, roughness: 0.35 }) : body;
    // Orden de caras de BoxGeometry: +x (tapa), -x (contratapa), +y, -y, +z (lomo), -z.
    const faces = [front, body, edge, edge, spine, edge];
    // Apagado sin cambiar de lugar: lo que no coincide con la búsqueda se oscurece y se aclara.
    return dim ? faces.map(dimmed) : faces;
  }, [cell, atlas, placed.shape, item.name, item.attributes.format, mats, cover, dim]);
  useEffect(() => {
    invalidate();
  }, [materials, invalidate]);

  // Pose: en su lugar; al elegirlo sale del estante y gira mostrando la tapa.
  const base = placed.position;
  const lying = !placed.upright;
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const target = new THREE.Vector3(...base);
    const rot = new THREE.Euler(lying ? -Math.PI / 2 : 0, 0, 0);
    if (dragPoint) {
      target.set(dragPoint.x, dragPoint.y + h * 0.15, dragPoint.z);
      rot.set(-0.1, -0.35, 0.05);
    } else if (selected) {
      if (lying) {
        target.y += d * 0.6 + h * 0.55;
        target.z += 0.12;
      } else {
        target.z += d * 0.85 + 0.05;
      }
      rot.set(0, -Math.PI / 2 + 0.22, 0);
    } else if (hovered) {
      if (lying) target.y += 0.012;
      else target.z += 0.012;
    }
    const k = 1 - Math.exp(-delta * 10);
    g.position.lerp(target, k);
    g.rotation.x += (rot.x - g.rotation.x) * k;
    g.rotation.y += (rot.y - g.rotation.y) * k;
    g.rotation.z += (rot.z - g.rotation.z) * k;
    const moving = g.position.distanceToSquared(target) > 1e-8 || Math.abs(rot.y - g.rotation.y) > 1e-4 || Math.abs(rot.x - g.rotation.x) > 1e-4;
    if (moving) invalidate();
  });

  // Arranca ya en su lugar (y en su orientación), sin volar desde el origen.
  useEffect(() => {
    if (group.current) {
      group.current.position.set(...base);
      group.current.rotation.set(lying ? -Math.PI / 2 : 0, 0, 0);
    }
    // Sólo al montar: después lo mueve useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La flecha va fuera del grupo que se mueve: queda quieta arriba del lugar del objeto, con la
  // punta tocando el lomo (al frente si está parado, arriba si está acostado en una caja).
  const arrowW = Math.min(0.03, Math.max(0.012, t + 0.002));
  const arrowH = arrowW * (400 / 128);
  const arrowPos: [number, number, number] = placed.upright
    ? [base[0], base[1] + h / 2 + 0.004 + arrowH / 2, base[2] + d / 2 + 0.006]
    : [base[0], base[1] + d / 2 + 0.004 + arrowH / 2, base[2]];

  return (
    <>
    {matched && !selected && !dragging && (
      <mesh position={arrowPos} material={mats.arrow} renderOrder={2}>
        <planeGeometry args={[arrowW, arrowH]} />
      </mesh>
    )}
    <group ref={group}>
      <mesh
        geometry={geometry}
        material={materials}
        castShadow={castShadow}
        receiveShadow
        onPointerDown={onPress}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
        visible={!dragging || dragPoint !== null}
      />
      {striking && (
        <mesh position={[0, 0, d / 2 + 0.004]} material={mats.cross}>
          <planeGeometry args={[Math.max(t * 1.6, 0.03), h * 0.95]} />
        </mesh>
      )}
    </group>
    </>
  );
}

/** La tapa de TMDB, pedida en vivo sólo cuando el objeto se saca del estante. */
function useCover(item: VaultItem | null): THREE.Texture | null {
  const url = item ? coverUrl(item.coverSource, item.coverRef, "md") : null;
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const done = (texture: THREE.Texture) => {
      if (!alive) return texture.dispose();
      texture.colorSpace = THREE.SRGBColorSpace;
      setLoaded({ url, texture });
      invalidate();
    };
    // Si la copia cacheada no trae CORS (la cargó un <img> viejo), se pide otra URL: misma imagen,
    // otra entrada de caché.
    loader.load(url, done, undefined, () => loader.load(`${url}?cors=1`, done, undefined, () => {}));
    return () => {
      alive = false;
    };
  }, [url, invalidate]);
  return url && loaded?.url === url ? loaded.texture : null;
}

/* ------------------------------------------------------------------ muebles */

function Room({ layout, mats }: { layout: SceneLayout; mats: Materials }) {
  const back = layout.backLength + 3;
  const left = Math.max(layout.leftLength, 1) + 3;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[back / 2 - 1, 0, left / 2 - 1]} material={mats.floor} receiveShadow>
        <planeGeometry args={[back + 4, left + 4]} />
      </mesh>
      {/* pared del fondo (z = 0) y pared de la izquierda (x = 0): el rincón es el origen */}
      <mesh position={[back / 2, 2, -0.002]} material={mats.wall} receiveShadow>
        <planeGeometry args={[back, 4]} />
      </mesh>
      <mesh position={[-0.002, 2, left / 2]} rotation={[0, Math.PI / 2, 0]} material={mats.wall} receiveShadow>
        <planeGeometry args={[left, 4]} />
      </mesh>
      {/* zócalos: separan la pared del piso, que son del mismo cemento */}
      <mesh position={[back / 2, 0.04, 0.01]} material={mats.baseboard}>
        <boxGeometry args={[back, 0.08, 0.02]} />
      </mesh>
      <mesh position={[0.01, 0.04, left / 2]} material={mats.baseboard}>
        <boxGeometry args={[0.02, 0.08, left]} />
      </mesh>
    </group>
  );
}

function Tape({ text, position, height = 0.034, rotation = 0, maxWidth = 0.6 }: { text: string; position: [number, number, number]; height?: number; rotation?: number; maxWidth?: number }) {
  const { map, aspect } = useMemo(() => tapeLabel(text), [text]);
  useEffect(() => () => map.dispose(), [map]);
  const width = Math.min(maxWidth, height * aspect);
  const h = width / aspect;
  return (
    <mesh position={position} rotation={[0, 0, rotation]}>
      <planeGeometry args={[width, h]} />
      <meshStandardMaterial map={map} roughness={0.9} transparent />
    </mesh>
  );
}

function Furniture({ container: c, mats, open, onSelect }: { container: PlacedContainer; mats: Materials; open: boolean; onSelect: () => void }) {
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };
  const label = c.name.toUpperCase();
  if (c.kind === "box") return <Box c={c} mats={mats} label={label} onClick={click} />;
  if (c.kind === "table") return <Table c={c} mats={mats} onClick={click} />;
  return <Shelving c={c} mats={mats} label={label} open={open} onClick={click} />;
}

function Board({ size, position, material }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material }) {
  return (
    <mesh position={position} material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Estantería abierta o mueble con puertas: mismos estantes, distinto frente. */
function Shelving({ c, mats, label, open, onClick }: { c: PlacedContainer; mats: Materials; label: string; open: boolean; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { x, width: w, height: h, depth: d, board } = c;
  const cx = x + w / 2;
  const cabinet = c.kind === "cabinet";
  // El mueble tiene un travesaño arriba de las puertas, donde va su cinta.
  const rail = cabinet ? 0.06 : 0;
  const top = h + rail;
  const lowest = c.levelFloors[c.levelFloors.length - 1] - board;
  const doorH = h - board - lowest;
  return (
    <group onClick={onClick}>
      {/* laterales, techo, zócalo y fondo */}
      <Board size={[board, top, d]} position={[x + board / 2, top / 2, 0]} material={mats.wood} />
      <Board size={[board, top, d]} position={[x + w - board / 2, top / 2, 0]} material={mats.wood} />
      <Board size={[w, board, d]} position={[cx, top - board / 2, 0]} material={mats.wood} />
      <Board size={[w - 2 * board, 0.06, d - 0.02]} position={[cx, 0.03, -0.01]} material={mats.woodDark} />
      <Board size={[w - 2 * board, top - 0.06, 0.01]} position={[cx, top / 2 + 0.03, -d / 2 + 0.005]} material={mats.back} />
      {cabinet && <Board size={[w - 2 * board, rail, 0.018]} position={[cx, h + rail / 2 - board / 2, d / 2 - 0.009]} material={mats.wood} />}
      {/* un estante por nivel, con su número en una cinta chica en el canto */}
      {c.levelFloors.map((floor, i) => (
        <group key={i}>
          <Board size={[w - 2 * board, board, d]} position={[cx, floor - board / 2, 0]} material={mats.wood} />
          {!cabinet && c.levelFloors.length > 1 && (
            <Tape text={`ESTANTE ${i + 1}`} position={[x + w - board - 0.07, floor - board / 2, d / 2 + 0.002]} height={0.026} rotation={0.015} maxWidth={0.12} />
          )}
        </group>
      ))}
      {/* el nombre, en una cinta grande arriba al frente */}
      <Tape text={label} position={[cx, top - (cabinet ? rail / 2 + board / 2 : board / 2), d / 2 + 0.012]} height={cabinet ? 0.042 : 0.036} rotation={-0.02} maxWidth={w - 0.08} />
      {cabinet && (
        <>
          <Door x={x + board} y={lowest} w={(w - 2 * board) / 2} h={doorH} z={d / 2} side="left" open={open} mats={mats} />
          <Door x={x + w - board} y={lowest} w={(w - 2 * board) / 2} h={doorH} z={d / 2} side="right" open={open} mats={mats} />
        </>
      )}
    </group>
  );
}

/** Una puerta con bisagra en el lateral: se abre sola cuando hay que mirar adentro. */
function Door({ x, y, w, h, z, side, open, mats }: { x: number; y: number; w: number; h: number; z: number; side: "left" | "right"; open: boolean; mats: Materials }) {
  const hinge = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const sign = side === "left" ? 1 : -1;
  useFrame((_, delta) => {
    const g = hinge.current;
    if (!g) return;
    const target = open ? -sign * 1.75 : 0;
    const k = 1 - Math.exp(-delta * 7);
    g.rotation.y += (target - g.rotation.y) * k;
    if (Math.abs(target - g.rotation.y) > 1e-3) invalidate();
  });
  return (
    <group ref={hinge} position={[x, y, z]}>
      <mesh position={[(sign * w) / 2, h / 2, 0.01]} material={mats.wood} castShadow>
        <boxGeometry args={[w - 0.004, h, 0.018]} />
      </mesh>
      {/* tirador */}
      <mesh position={[sign * (w - 0.04), h / 2, 0.026]} material={mats.woodDark}>
        <boxGeometry args={[0.012, 0.09, 0.012]} />
      </mesh>
    </group>
  );
}

/**
 * Una caja de cartón abierta: la solapa de adelante cuelga por fuera, la de atrás y las de los
 * costados quedan abiertas hacia arriba, como cuando se revuelve una caja de mudanza.
 */
function Box({ c, mats, label, onClick }: { c: PlacedContainer; mats: Materials; label: string; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { x, width: w, height: h, depth: d } = c;
  const cx = x + w / 2;
  const wall = 0.006;
  const long = Math.min(d / 2, h * 0.55);
  const short = d / 2 - 0.01;
  return (
    <group onClick={onClick}>
      <Board size={[w, wall, d]} position={[cx, wall / 2, 0]} material={mats.kraft} />
      <Board size={[w, h, wall]} position={[cx, h / 2, d / 2 - wall / 2]} material={mats.kraft} />
      <Board size={[w, h, wall]} position={[cx, h / 2, -d / 2 + wall / 2]} material={mats.kraft} />
      <Board size={[wall, h, d]} position={[x + wall / 2, h / 2, 0]} material={mats.kraft} />
      <Board size={[wall, h, d]} position={[x + w - wall / 2, h / 2, 0]} material={mats.kraft} />
      {/* solapa de adelante: cuelga por fuera, apenas separada de la pared */}
      <group position={[cx, h, d / 2]} rotation={[2.95, 0, 0]}>
        <mesh position={[0, 0, long / 2]} material={mats.kraft} castShadow>
          <boxGeometry args={[w, wall, long]} />
        </mesh>
      </group>
      {/* solapa de atrás: abierta hacia arriba y afuera */}
      <group position={[cx, h, -d / 2]} rotation={[0.75, 0, 0]}>
        <mesh position={[0, 0, -long / 2]} material={mats.kraft} castShadow>
          <boxGeometry args={[w, wall, long]} />
        </mesh>
      </group>
      {/* solapas de los costados, abiertas hacia afuera */}
      <group position={[x, h, 0]} rotation={[0, 0, 2.3]}>
        <mesh position={[short / 2, 0, 0]} material={mats.kraft} castShadow>
          <boxGeometry args={[short, wall, d - 0.01]} />
        </mesh>
      </group>
      <group position={[x + w, h, 0]} rotation={[0, 0, -2.3]}>
        <mesh position={[-short / 2, 0, 0]} material={mats.kraft} castShadow>
          <boxGeometry args={[short, wall, d - 0.01]} />
        </mesh>
      </group>
      {/* el nombre, escrito en cinta por debajo de la solapa que cuelga */}
      <Tape text={label} position={[cx, (h - long) / 2 + 0.004, d / 2 + 0.003]} height={Math.min(0.05, (h - long) * 0.75)} rotation={-0.025} maxWidth={w - 0.05} />
    </group>
  );
}

function Table({ c, mats, onClick }: { c: PlacedContainer; mats: Materials; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { x, width: w, height: h, depth: d, board } = c;
  const cx = x + w / 2;
  const leg = 0.035;
  return (
    <group onClick={onClick}>
      <Board size={[w, board, d]} position={[cx, h - board / 2, 0]} material={mats.wood} />
      {[
        [x + leg, d / 2 - leg],
        [x + w - leg, d / 2 - leg],
        [x + leg, -d / 2 + leg],
        [x + w - leg, -d / 2 + leg],
      ].map(([lx, lz], i) => (
        <Board key={i} size={[leg, h - board, leg]} position={[lx, (h - board) / 2, lz]} material={mats.woodDark} />
      ))}
      <Tape text="SIN UBICAR" position={[x + 0.14, h - board / 2, d / 2 + 0.002]} height={0.028} maxWidth={0.26} />
    </group>
  );
}

/** Al arrastrar: el estante de destino se tiñe con color de cinta y una raya de fibrón marca el hueco. */
function DropHint({ target, mats }: { target: { slot: Slot; index: number }; mats: Materials }) {
  const { slot, index } = target;
  const x = slot.edges[Math.min(index, slot.edges.length - 1)];
  const height = 0.2;
  return (
    <group>
      <mesh position={[(slot.x0 + slot.x1) / 2, slot.floor + 0.004, slot.z - 0.05]} rotation={[-Math.PI / 2, 0, 0]} material={mats.slot}>
        <planeGeometry args={[slot.x1 - slot.x0 - 0.04, 0.1]} />
      </mesh>
      <mesh position={[x, slot.floor + height / 2, slot.z + 0.01]} material={mats.insert}>
        <boxGeometry args={[0.006, height, 0.006]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ cámara */

/**
 * Lleva la cámara a lo que importa: toda la casa (en diagonal, desde el medio de la habitación,
 * mirando al rincón de la L), el mueble elegido (de frente), lo que coincide con la búsqueda o el
 * objeto que se sacó. Vuela una vez por cambio y después la cámara es del usuario.
 */
function CameraRig({
  layout,
  containerById,
  focusContainer,
  matched,
  selected,
}: {
  layout: SceneLayout;
  containerById: Map<string | null, PlacedContainer>;
  focusContainer: string | null | "all";
  matched: PlacedItem[];
  selected: PlacedItem | null;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);

  const frame = useMemo(() => {
    const box = new THREE.Box3();
    const add = (c: PlacedContainer, p: [number, number, number]) => box.expandByPoint(new THREE.Vector3(...toWorld(c, p)));
    const addContainer = (c: PlacedContainer) => {
      for (const x of [c.x, c.x + c.width]) for (const y of [0, c.height]) for (const z of [-c.depth / 2, c.depth / 2]) add(c, [x, y, z]);
    };
    const facing = new THREE.Vector3();
    const look = (c: PlacedContainer) => facing.add(new THREE.Vector3(...frontNormal(c)));

    if (selected) {
      const c = containerById.get(selected.containerId)!;
      const up = selected.upright ? 0.22 : 0.42;
      const [x, y, z] = selected.position;
      // Lo que se saca de una caja sube: hay que dejarle lugar arriba a la tapa.
      add(c, [x - 0.28, y - 0.16, z]);
      add(c, [x + 0.28, y + up, z + 0.2]);
      look(c);
    } else if (matched.length) {
      for (const m of matched) {
        const c = containerById.get(m.containerId)!;
        const [x, y, z] = m.position;
        add(c, [x - 0.2, y - 0.15, z]);
        add(c, [x + 0.2, y + 0.2, z]);
        look(c);
      }
    } else if (focusContainer !== "all" && containerById.has(focusContainer)) {
      const c = containerById.get(focusContainer)!;
      addContainer(c);
      look(c);
    } else {
      for (const c of layout.containers) addContainer(c);
      // Toda la casa: en diagonal hacia el rincón si hay L, casi de frente si no.
      facing.set(layout.leftLength ? 0.8 : 0.15, 0, 1);
    }
    return { box, facing: facing.lengthSq() ? facing.normalize() : new THREE.Vector3(0, 0, 1) };
  }, [layout, containerById, focusContainer, matched, selected]);

  // La casa entera se mira más desde arriba: el piso llena la pantalla en vez de la pared vacía.
  const whole = !selected && !matched.length && !(focusContainer !== "all" && containerById.has(focusContainer));

  useEffect(() => {
    const center = frame.box.getCenter(new THREE.Vector3());
    const sphere = frame.box.getBoundingSphere(new THREE.Sphere());
    const vfov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const fov = Math.min(vfov, hfov);
    // La esfera envolvente sobra en las esquinas de una caja: se la achica un poco.
    const dist = (sphere.radius * (whole ? 0.72 : 0.9)) / Math.sin(fov / 2) + 0.05;
    const dir = frame.facing.clone().setY(whole ? 0.4 : 0.32).normalize();
    goal.current = { target: center, position: center.clone().add(dir.multiplyScalar(dist)) };
    invalidate();
  }, [frame, camera, size, invalidate, whole]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-delta * 4.5);
    controls.target.lerp(g.target, k);
    camera.position.lerp(g.position, k);
    controls.update();
    if (camera.position.distanceToSquared(g.position) < 1e-6 && controls.target.distanceToSquared(g.target) < 1e-6) goal.current = null;
    else invalidate();
  });

  return null;
}
