import { cn } from "@/lib/utils";

/** La marca: el nombre escrito con fibrón en un pedazo de cinta de papel, como un rótulo de caja. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "tape inline-block -rotate-2 px-3.5 py-0.5 text-xl leading-tight tracking-wide whitespace-nowrap shadow-[0_1px_2px_rgb(0_0_0/18%)]",
        className,
      )}
    >
      THE VAULT
    </span>
  );
}
