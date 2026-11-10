import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { loginAction, signupEnabled } from "@/lib/actions/auth";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).t.meta.login };
}

export default async function LoginPage() {
  return <AuthForm mode="login" action={loginAction} signupEnabled={await signupEnabled()} />;
}
