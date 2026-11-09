import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { auth } from "@/lib/auth/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      {/* Un resplandor dorado detrás de la tarjeta, como la luz de una bóveda abierta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="[&_svg]:size-10 [&>span]:text-2xl" />
          <p className="text-sm text-muted-foreground">Tu colección, a la vista.</p>
        </div>
        <div className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">{children}</div>
      </div>
    </main>
  );
}
