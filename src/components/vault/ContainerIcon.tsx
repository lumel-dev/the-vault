import { cn } from "@/lib/utils";

/** La silueta de cada forma de contenedor, dibujada con el mismo trazo que los íconos de lucide. */
export function ContainerIcon({ kind, className }: { kind: string | null; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn("size-5 shrink-0", className),
    "aria-hidden": true,
  };
  switch (kind) {
    case "box":
      return (
        <svg {...common}>
          <path d="M4 10h16v10H4z" />
          <path d="M4 10 2 6.5h7L12 10M20 10l2-3.5h-7L12 10" />
          <path d="M8 14h5" />
        </svg>
      );
    case "cabinet":
      return (
        <svg {...common}>
          <path d="M4 3h16v16H4zM12 3v16M6 19v2M18 19v2" />
          <path d="M10 10v2M14 10v2" />
        </svg>
      );
    case "shelf":
      return (
        <svg {...common}>
          <path d="M4 3v18M20 3v18M4 9h16M4 15h16M4 21h16M4 3h16" />
          <path d="M7 5v4M9 5.5V9M12 11v4M7 17v4M9.5 17v4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 10h18M5 10v9M19 10v9" />
          <path d="M7 6v4M9.5 7v3M14 5.5V10" strokeDasharray="0" />
        </svg>
      );
  }
}
