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
  name: z.string().min(1, "Tell us what to call you."),
  organization: z.string().min(2, "Organization name needs at least 2 characters."),
  email: z.string().email("Enter a valid work email address."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[0-9]/, "Include a number."),
});

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const router = useRouter();
  const { register } = useSession();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", organization: "", email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setPending(true);
    setError(null);
    try {
      await register({ name: values.name, organizationName: values.organization, email: values.email, password: values.password });
      router.replace("/onboarding");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create your account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sign-up-name">Your name</Label>
            <Input id="sign-up-name" autoComplete="name" {...form.register("name")} />
            {form.formState.errors.name ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sign-up-organization">Organization</Label>
            <Input id="sign-up-organization" autoComplete="organization" {...form.register("organization")} />
            {form.formState.errors.organization ? (
              <p className="text-xs text-destructive">{form.formState.errors.organization.message}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-email">Work email</Label>
          <Input id="sign-up-email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email ? <p className="text-xs text-destructive">{form.formState.errors.email.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sign-up-password">Password</Label>
          <Input id="sign-up-password" type="password" autoComplete="new-password" {...form.register("password")} />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least 12 characters with uppercase, lowercase, and a number.</p>
          )}
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="mt-2" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="text-foreground underline-offset-4 hover:underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </div>
  );
}
