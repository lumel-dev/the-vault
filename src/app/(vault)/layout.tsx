import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { logoutAction } from "@/lib/actions/auth";
import { auth } from "@/lib/auth/auth";

export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <header className="sticky top-0 z-30 mb-5 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[110rem] items-center justify-between gap-4 px-4 md:px-6">
          <Logo />
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.name}</span>
            <button
              type="submit"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Salir"
              title="Salir"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
