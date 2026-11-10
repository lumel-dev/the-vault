import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { signupAction, signupEnabled } from "@/lib/actions/auth";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).t.meta.signup };
}

export default async function SignupPage() {
  if (!(await signupEnabled())) notFound();
  return <AuthForm mode="signup" action={signupAction} />;
}
