"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/actions/auth";

interface Props {
  mode: "login" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  signupEnabled?: boolean;
}

export function AuthForm({ mode, action, signupEnabled }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="grid gap-4">
      {isSignup && (
        <div className="grid gap-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
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
        {pending ? "Un momento…" : isSignup ? "Crear cuenta" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Entrá
            </Link>
          </>
        ) : signupEnabled ? (
          <>
            ¿Primera vez?{" "}
            <Link href="/registro" className="text-primary hover:underline">
              Creá tu cuenta
            </Link>
          </>
        ) : null}
      </p>
    </form>
  );
}
