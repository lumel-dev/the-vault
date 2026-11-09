"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/addons/controls/OrbitControls.js";
import { coverUrl } from "@/lib/covers";
import type { VaultItem, VaultShelf } from "@/lib/queries";
import { buildLayout, dropTarget, type PlacedContainer, type PlacedItem, type SceneLayout, type Slot } from "@/lib/scene-layout";
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

const FRONT_PLANE_Z = 0.16;

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
      camera={{ fov: 32, near: 0.05, far: 80, position: [1.5, 1.2, 5] }}
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

  return (
    <>
      <hemisphereLight args={["#ffffff", "#b9b4a8", 1.35]} />
      {/* luz de frente, suave: deja leer los lomos dentro de los muebles */}
      <directionalLight position={[layout.width / 2, 1.2, 5]} intensity={0.55} />
      <directionalLight
        position={[layout.width * 0.3 - 1, 4.5, 3.5]}
        intensity={1.6}
        castShadow={!coarse}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2}
        shadow-camera-right={layout.width + 2}
        shadow-camera-top={3}
        shadow-camera-bottom={-1}
        shadow-bias={-0.0004}
      />
      <Room layout={layout} mats={mats} />

      {layout.containers.map((c) => (
        <Furniture
          key={c.id ?? "loose"}
          container={c}
          mats={mats}
          open={drag !== null || openContainers.has(c.id)}
          onSelect={() => onSelectContainer(c.id)}
        />
      ))}

      {atlas &&
        layout.items.map((p) => {
          const item = itemById.get(p.id);
          if (!item) return null;
          return (
            <ItemMesh
              key={p.id}
              placed={p}
              item={item}
              atlas={atlas}
              mats={mats}
              dim={matches !== null && !matches.has(p.id)}
              matched={matches !== null && matches.has(p.id)}
              selected={selectedId === p.id}
              striking={pendingDelete.has(p.id)}
              dragging={drag?.id === p.id}
              dragPoint={drag?.id === p.id ? drag.point : null}
              castShadow={!coarse}
              onPress={(e) => startPress(e, p.id)}
            />
          );
        })}

      {drag?.target && <DropHint target={drag.target} mats={mats} />}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={0.35}
        maxDistance={14}
        minPolarAngle={0.55}
        maxPolarAngle={1.62}
        minAzimuthAngle={-0.85}
        maxAzimuthAngle={0.85}
        screenSpacePanning
      />
      <CameraRig layout={layout} focusContainer={focusContainer} matched={settledMatches} selected={selectedId ? placedById.get(selectedId) ?? null : null} />
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
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -FRONT_PLANE_Z);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const camera = e.camera;
    const dom = (e.nativeEvent.target as HTMLElement) ?? document.body;

    const project = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return hit.clone();
    };

    const begin = (clientX: number, clientY: number) => {
      started = true;
      if (controls) controls.enabled = false;
      const point = project(clientX, clientY) ?? new THREE.Vector3();
      setDrag({ id, point, target: dropTarget(layout, point.x, point.y) });
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
      const point = project(ev.clientX, ev.clientY);
      if (point) setDrag({ id, point, target: dropTarget(layout, point.x, point.y) });
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
      const point = project(ev.clientX, ev.clientY);
      const target = point ? dropTarget(layout, point.x, point.y) : null;
      setDrag(null);
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
      target.set(dragPoint.x, dragPoint.y + h * 0.15, FRONT_PLANE_Z + 0.18);
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
    loader.load(
      url,
      (texture) => {
        if (!alive) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        setLoaded({ url, texture });
        invalidate();
      },
      undefined,
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [url, invalidate]);
  return url && loaded?.url === url ? loaded.texture : null;
}

/* ------------------------------------------------------------------ muebles */

function Room({ layout, mats }: { layout: SceneLayout; mats: Materials }) {
  const w = layout.width + 10;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[layout.width / 2, 0, 2]} material={mats.floor} receiveShadow>
        <planeGeometry args={[w, 9]} />
      </mesh>
      <mesh position={[layout.width / 2, 2, -0.45]} material={mats.wall} receiveShadow>
        <planeGeometry args={[w, 4]} />
      </mesh>
      {/* zócalo: separa la pared del piso, que son del mismo cemento */}
      <mesh position={[layout.width / 2, 0.04, -0.44]} material={mats.baseboard}>
        <boxGeometry args={[w, 0.08, 0.02]} />
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
 * Lleva la cámara a lo que importa: toda la colección, el mueble elegido, lo que coincide con la
 * búsqueda o el objeto que se sacó. Vuela una vez por cambio y después la cámara es del usuario.
 */
function CameraRig({
  layout,
  focusContainer,
  matched,
  selected,
}: {
  layout: SceneLayout;
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
    let box: THREE.Box3;
    if (selected) {
      const p = new THREE.Vector3(...selected.position);
      // Lo que se saca de una caja sube: hay que dejarle lugar arriba a la tapa.
      const up = selected.upright ? 0.22 : 0.42;
      box = new THREE.Box3(p.clone().add(new THREE.Vector3(-0.28, -0.16, 0)), p.clone().add(new THREE.Vector3(0.28, up, 0.2)));
    } else if (matched.length) {
      box = new THREE.Box3();
      for (const m of matched) box.expandByPoint(new THREE.Vector3(...m.position));
      box.expandByVector(new THREE.Vector3(0.25, 0.22, 0));
    } else if (focusContainer !== "all") {
      const c = layout.containers.find((k) => k.id === focusContainer);
      box = c
        ? new THREE.Box3(new THREE.Vector3(c.x - 0.1, 0, 0), new THREE.Vector3(c.x + c.width + 0.1, c.height + 0.1, 0))
        : new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(layout.width, layout.height, 0));
    } else {
      box = new THREE.Box3(new THREE.Vector3(-0.04, 0, 0), new THREE.Vector3(layout.width + 0.04, layout.height + 0.02, 0));
    }
    return box;
  }, [layout, focusContainer, matched, selected]);

  // La casa entera se mira más desde arriba: el piso llena la pantalla en vez de la pared vacía.
  const whole = !selected && !matched.length && focusContainer === "all";

  useEffect(() => {
    const center = frame.getCenter(new THREE.Vector3());
    const extent = frame.getSize(new THREE.Vector3());
    const vfov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = Math.max(extent.x / 2 / Math.tan(hfov / 2), extent.y / 2 / Math.tan(vfov / 2)) * 1.0 + 0.05;
    // Un poco desde arriba, para que se vea adentro de las cajas.
    const target = center.clone();
    const position = center.clone().add(new THREE.Vector3(0, dist * (whole ? 0.5 : 0.3), dist));
    goal.current = { target, position };
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
