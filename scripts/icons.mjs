/*
 * Genera los íconos de la PWA (`public/icons/`) a partir de `src/app/icon.svg`.
 *
 *   node scripts/icons.mjs
 *
 * No hay que instalar nada: `sharp` viene como dependencia opcional de `next`, pero pnpm no lo
 * deja en la raíz de `node_modules`, así que se resuelve desde `next`. No va en el `package.json`
 * (en runtime no se usa: `images.unoptimized` está en `true`). Igual que en erp-base.
 *
 * El `maskable` es otro dibujo: Android lo recorta en círculo o en "squircle", así que va sin
 * esquinas redondeadas y con la rueda de la bóveda más chica, dentro de la zona segura (80 %).
 */
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromNext = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const sharp = fromNext("sharp");

const OUT = join(ROOT, "public/icons");
await mkdir(OUT, { recursive: true });

const icon = await readFile(join(ROOT, "src/app/icon.svg"));

// La rueda del ícono, centrada en 16,16 y escalada para que entre en la zona segura.
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" fill="#15171c"/>
<g transform="translate(16 16) scale(0.72) translate(-16 -16)">
<circle cx="16" cy="16" r="9" fill="none" stroke="#e9b949" stroke-width="2.2"/>
<circle cx="16" cy="16" r="2.4" fill="#e9b949"/>
<path d="M16 9.5v4M16 18.5v4M9.5 16h4M18.5 16h4" stroke="#e9b949" stroke-width="2.2" stroke-linecap="round"/>
</g></svg>`);

async function render(svg, size, name) {
  await sharp(svg, { density: Math.ceil((72 * size) / 32) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name));
  console.log(`  ${name}  ${size}x${size}`);
}

await render(icon, 192, "icon-192.png");
await render(icon, 512, "icon-512.png");
await render(maskable, 512, "maskable-512.png");
await render(icon, 180, "apple-touch-icon.png");
