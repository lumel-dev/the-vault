import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { signupAction, signupEnabled } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignupPage() {
  if (!(await signupEnabled())) notFound();
  return <AuthForm mode="signup" action={signupAction} />;
}
