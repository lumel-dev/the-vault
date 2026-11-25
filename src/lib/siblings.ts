/**
 * Dónde va algo que llega a un mueble donde ya están sus "hermanos" (las otras temporadas de la
 * misma serie, el mismo `external_id`): al lado de ellos, en el orden de las temporadas. La T2
 * entra entre la T1 y la T3; sin una anterior, antes de la primera.
 *
 * Recibe lo que ya hay en el contenedor, en orden, y devuelve el lugar donde insertar; `null`
 * cuando no hay hermanos (entonces va donde iría cualquier cosa: al final).
 */
export function siblingIndex(
  contents: { externalId: string | null; attributes: Record<string, string> }[],
  externalId: string | null | undefined,
  season: string | undefined,
): number | null {
  if (!externalId) return null;
  const n = Number(season) || 0;
  let first: number | null = null;
  let after: number | null = null;
  contents.forEach((item, i) => {
    if (item.externalId !== externalId) return;
    if (first === null) first = i;
    if ((Number(item.attributes.season) || 0) <= n) after = i + 1;
  });
  return after ?? first;
}
