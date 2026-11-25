// Recibe lotes de la cola de cambios del browser y los aplica en orden (`src/lib/offline/`).
//
// Es un endpoint de sesión: sin sesión contesta 401 y el browser guarda todo hasta el próximo
// login. Un cambio de otra cuenta (hecho en este browser por otra persona) no se aplica con esta.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { batchSchema, type Op, type OpResult } from "@/lib/offline/ops";
import { applyQueued } from "@/lib/offline/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Las Server Actions traen el chequeo de origen de Next; un route handler no. La cookie de sesión
 * es `SameSite=Lax` y no viaja en un POST de otro sitio, pero no se apuesta sólo a eso.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "origin" }, { status: 403, headers: NO_STORE });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "session" }, { status: 401, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "batch" }, { status: 400, headers: NO_STORE });
  }
  const batch = batchSchema.safeParse(body);
  if (!batch.success) return NextResponse.json({ error: "batch" }, { status: 400, headers: NO_STORE });

  // En orden y de a uno: mover algo necesita que ya exista. Si algo falla por un motivo que no es
  // del usuario, el lote se corta ahí y el resto queda para el próximo intento.
  const results: OpResult[] = [];
  for (const { seq, userId: owner, op } of batch.data.ops) {
    if (owner !== userId) {
      results.push({ seq, result: "other_user" });
      continue;
    }
    // Los datos de cada formulario los valida la action que lo aplica.
    const res = await applyQueued(seq, op as Op, userId);
    results.push(res);
    if (res.result === "retry") break;
  }
  return NextResponse.json({ results }, { headers: NO_STORE });
}
