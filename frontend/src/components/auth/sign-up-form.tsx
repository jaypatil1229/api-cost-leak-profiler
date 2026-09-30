"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrototypeNotice } from "./auth-shell";

const schema = z.object({
  name: z.string().min(2, "Tell us what to call you."),
  organization: z.string().min(2, "Organization name needs at least 2 characters."),
  email: z.string().email("Enter a valid work email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[0-9]/, "Include at least one number."),
  agree: z.boolean().refine((value) => value === true, "Confirm this is a prototype build to continue."),
});

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", organization: "", email: "", password: "", agree: false },
  });
  const agree = form.watch("agree");

  function onSubmit(values: Values) {
    try {
      window.localStorage.setItem("aclp.onboarding.v1", JSON.stringify({ name: values.name, organization: values.organization, email: values.email }));
    } catch {
      /* storage unavailable */
    }
    toast.success("Workspace details captured locally", { description: "Nothing was submitted to a server." });
    router.push("/onboarding");
  }

  return (
    <div className="flex flex-col gap-6">
      <PrototypeNotice />

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
            <p className="text-xs text-muted-foreground">At least 8 characters with one number. Stored nowhere.</p>
          )}
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="sign-up-agree"
            checked={agree}
            aria-invalid={Boolean(form.formState.errors.agree)}
            onCheckedChange={(checked) => form.setValue("agree", checked === true, { shouldValidate: true })}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="sign-up-agree" className="text-sm font-normal">
              I understand this is a prototype and no account will be created.
            </Label>
            {form.formState.errors.agree ? <p className="text-xs text-destructive">{form.formState.errors.agree.message}</p> : null}
          </div>
        </div>

        <Button type="submit" className="mt-2">
          Continue to setup
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
