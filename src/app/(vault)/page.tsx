import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { VaultApp, type View } from "@/components/vault/VaultApp";
import { logoutAction } from "@/lib/actions/auth";
import { auth } from "@/lib/auth/auth";
import { isItemType } from "@/lib/item-types";
import { isUuid, listItems, listShelves, listStickers } from "@/lib/queries";
import { tmdbEnabled } from "@/lib/tmdb";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** La hora del server al armar la página: el browser la compara con la de su copia guardada. */
function stamp(): number {
  return Date.now();
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function VaultPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const sp = await searchParams;
  const q = one(sp.q).slice(0, 200);
  // Un sticker (su id) o, en links de antes, un tipo.
  const rawType = one(sp.tipo);
  const type = isItemType(rawType) || isUuid(rawType) ? rawType : "all";
  const rawShelf = one(sp.estante);
  const shelf = rawShelf === "none" || isUuid(rawShelf) ? rawShelf : "all";
  const rawView = one(sp.vista);
  const view: View | null = rawView === "mueble" || rawView === "grilla" ? rawView : null;

  // Antes de leer: lo que se lea es al menos tan nuevo como esta hora.
  const renderedAt = stamp();
  // Los stickers primero: si la cuenta no tiene, se crean los de fábrica.
  const stickers = await listStickers(userId);
  const [items, shelfData] = await Promise.all([listItems(userId), listShelves(userId)]);

  return (
    <VaultApp
      userId={userId}
      renderedAt={renderedAt}
      items={items}
      stickers={stickers}
      shelves={shelfData.shelves}
      filters={{ q, type, shelf, view, sort: one(sp.orden) }}
      tmdbEnabled={tmdbEnabled()}
      userName={session.user.name ?? ""}
      logout={
        <form key="logout" action={logoutAction}>
          <button
            type="submit"
            className="grid size-9 place-items-center rounded-md text-marker/80 transition hover:bg-marker/10 hover:text-marker"
            aria-label="Salir"
            title="Salir"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      }
    />
  );
}
