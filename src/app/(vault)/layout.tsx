import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return children;
}
