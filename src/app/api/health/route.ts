// Liveness para el monitor externo (UptimeRobot): sin auth, sin base y sin redirect. Sólo
// confirma que el proceso de Node atiende requests. No toca la base a propósito: un ping cada
// pocos minutos no dejaría que Neon suspenda la base ociosa.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
