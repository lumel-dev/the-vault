import { cn } from "@/lib/utils";

/** La marca: una puerta de bóveda (círculo con el volante) y el nombre. */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0 text-primary">
        <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" opacity="0.14" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="16" cy="16" r="2.4" fill="currentColor" />
        <path d="M16 9.5v4M16 18.5v4M9.5 16h4M18.5 16h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {showName && <span className="font-display text-lg font-bold tracking-tight">The Vault</span>}
    </span>
  );
}
