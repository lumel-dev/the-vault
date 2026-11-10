"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/actions/auth";
import { useI18n } from "@/lib/i18n/client";

interface Props {
  mode: "login" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  signupEnabled?: boolean;
}

export function AuthForm({ mode, action, signupEnabled }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isSignup = mode === "signup";
  const { t } = useI18n();

  return (
    <form action={formAction} className="grid gap-4">
      {isSignup && (
        <div className="grid gap-1.5">
          <Label htmlFor="name">{t.auth.name}</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 10 : undefined}
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-10">
        {pending ? t.common.loading : isSignup ? t.auth.submitSignup : t.auth.submitLogin}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            {t.auth.haveAccount}{" "}
            <Link href="/login" className="font-semibold underline underline-offset-4 hover:text-marker-red">
              {t.auth.goLogin}
            </Link>
          </>
        ) : signupEnabled ? (
          <>
            {t.auth.firstTime}{" "}
            <Link href="/registro" className="font-semibold underline underline-offset-4 hover:text-marker-red">
              {t.auth.goSignup}
            </Link>
          </>
        ) : null}
      </p>
    </form>
  );
}
