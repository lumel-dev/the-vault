import { BookOpen, Disc3, Film, Gamepad2, Package, Tv, type LucideProps } from "lucide-react";
import type { ItemType } from "@/lib/item-types";

const ICONS: Record<ItemType, React.ComponentType<LucideProps>> = {
  movie: Film,
  series: Tv,
  book: BookOpen,
  music: Disc3,
  game: Gamepad2,
  other: Package,
};

export function TypeIcon({ type, ...props }: { type: string } & LucideProps) {
  const Icon = ICONS[type as ItemType] ?? Package;
  return <Icon aria-hidden {...props} />;
}
