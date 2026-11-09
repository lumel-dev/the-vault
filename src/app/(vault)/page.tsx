import { redirect } from "next/navigation";
import { VaultBoard } from "@/components/vault/VaultBoard";
import { auth } from "@/lib/auth/auth";
import { isItemType } from "@/lib/item-types";
import { isUuid, listItems, listShelves } from "@/lib/queries";
import { tmdbEnabled } from "@/lib/tmdb";

type SearchParams = Promise<{ q?: string | string[]; tipo?: string | string[]; estante?: string | string[] }>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function VaultPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 200);
  const type = isItemType(one(sp.tipo)) ? one(sp.tipo) : "all";
  const rawShelf = one(sp.estante);
  const shelf = rawShelf === "none" || isUuid(rawShelf) ? rawShelf : "all";

  const [items, shelfData] = await Promise.all([listItems(userId, { q, type, shelf }), listShelves(userId)]);

  return (
    <VaultBoard
      items={items}
      shelves={shelfData.shelves}
      unshelved={shelfData.unshelved}
      total={shelfData.total}
      filters={{ q, type, shelf }}
      tmdbEnabled={tmdbEnabled()}
    />
  );
}
