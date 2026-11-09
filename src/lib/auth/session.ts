import { auth } from "./auth";

/**
 * El id del usuario logueado. Toda server action y toda consulta pasan por acá: cada usuario ve y
 * toca sólo su colección, y el id sale de la sesión, nunca de lo que manda el browser.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("No autenticado");
  return id;
}
