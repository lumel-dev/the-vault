import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { loginAction, signupEnabled } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  return <AuthForm mode="login" action={loginAction} signupEnabled={await signupEnabled()} />;
}
