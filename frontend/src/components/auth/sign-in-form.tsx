"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/auth/session-provider";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export function SignInForm() {
  const router = useRouter();
  const { login } = useSession();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    setError(null);
    try {
      await login(values.email, values.password);
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/overview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-in-email">Work email</Label>
          <Input id="sign-in-email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={Boolean(form.formState.errors.email)} />
          {form.formState.errors.email ? <p className="text-xs text-destructive">{form.formState.errors.email.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="sign-in-password">Password</Label>
            <Link className="text-xs text-muted-foreground underline-offset-4 hover:underline" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <Input id="sign-in-password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={Boolean(form.formState.errors.password)} />
          {form.formState.errors.password ? <p className="text-xs text-destructive">{form.formState.errors.password.message}</p> : null}
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="mt-2" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        New to ACLP?{" "}
        <Link className="text-foreground underline-offset-4 hover:underline" href="/sign-up">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
