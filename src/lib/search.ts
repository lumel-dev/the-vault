/**
 * La búsqueda de la colección, en el browser. Corre sobre la colección entera que ya está cargada,
 * así que contesta "¿lo tengo?" al instante, también en el celular y con mala señal.
 *
 * Reglas: cada palabra tiene que aparecer, sin importar mayúsculas ni acentos, en el nombre, la
 * marca, el modelo, la descripción, los atributos (temporada, dirección, autor…) o el número de
 * inventario. Si así no aparece nada, una palabra de 4 letras o más también vale si se parece lo
 * suficiente a alguna palabra del objeto (trigramas, como `word_similarity` de pg_trgm): "matirx"
 * encuentra Matrix. Las cortas sólo valen tal cual, porque "de" o "la" se parecen a todo.
 */

export interface Searchable {
  name: string;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  attributes: Record<string, string>;
  inventoryNumber?: number;
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * Qué parte de los trigramas de lo buscado aparece en la palabra (0 a 1), la idea de
 * `word_similarity` de pg_trgm: "matirx" contra "matrix" da 3/7 = 0,43. La similitud simétrica
 * daría 0,27 y castigaría de más a las palabras cortas.
 */
export function wordSimilarity(query: string, word: string): number {
  const tq = trigrams(query);
  const tw = trigrams(word);
  let shared = 0;
  for (const t of tq) if (tw.has(t)) shared++;
  return shared / tq.size;
}

const FUZZY_MIN_LENGTH = 4;
// 0,42 y no 0,4: con 0,4 "cosa" encontraba "casa" y "consola" (2 de 5 trigramas).
const FUZZY_THRESHOLD = 0.42;

export function searchText(item: Searchable): string {
  const number = item.inventoryNumber ? ` ${item.inventoryNumber} ${String(item.inventoryNumber).padStart(4, "0")}` : "";
  return normalize(
    [item.name, item.brand, item.model, item.description, ...Object.values(item.attributes)].filter(Boolean).join(" ") + number,
  );
}

/** Un buscador preparado para una consulta: se arma una vez y se aplica a cada objeto. */
export function matcher(query: string, { fuzzy = true }: { fuzzy?: boolean } = {}): ((item: Searchable) => boolean) | null {
  const terms = normalize(query).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return null;
  return (item) => {
    const text = searchText(item);
    const words = text.split(/[^a-z0-9ñ]+/).filter(Boolean);
    return terms.every((term) => {
      if (text.includes(term)) return true;
      if (!fuzzy || term.length < FUZZY_MIN_LENGTH) return false;
      return words.some((w) => wordSimilarity(term, w) >= FUZZY_THRESHOLD);
    });
  };
}

/**
 * Busca en la colección: primero tal cual (sin acentos ni mayúsculas) y, sólo si eso no encuentra
 * nada, con tolerancia a errores de tipeo. Así "matirx" encuentra Matrix, pero "lost" encuentra
 * Lost y no "Los Soprano" (que comparte 3 de los 5 trigramas de "lost").
 */
export function search<T extends Searchable>(items: T[], query: string): T[] | null {
  const exact = matcher(query, { fuzzy: false });
  if (!exact) return null;
  const found = items.filter(exact);
  if (found.length) return found;
  return items.filter(matcher(query)!);
}
