import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { auth } from "@/lib/auth/auth";
import { getMessages } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const { t } = await getMessages();

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo className="text-3xl" />
          <p className="text-sm text-muted-foreground">{t.meta.tagline}</p>
        </div>
        {/* La tarjeta es una caja de cartón: tapa kraft arriba y el formulario adentro. */}
        <div className="overflow-hidden rounded-lg bg-card shadow-[0_18px_40px_-18px_rgb(28_27_25/55%)]">
          <div aria-hidden className="h-3 border-b-2 border-kraft-dark bg-kraft" />
          <div className="p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
