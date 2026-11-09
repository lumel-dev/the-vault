import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  movie: "bg-sticker-movie",
  series: "bg-sticker-series",
  book: "bg-sticker-book",
  music: "bg-sticker-music",
  game: "bg-sticker-game",
  other: "bg-sticker-other",
};

/** El sticker circular de color que identifica el tipo, como los de librería. */
export function Sticker({ type, className }: { type: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3 shrink-0 rounded-full shadow-[inset_0_-1px_0_rgb(0_0_0/18%),0_0_0_1.5px_rgb(255_255_255/70%)]",
        COLORS[type] ?? COLORS.other,
        className,
      )}
    />
  );
}
