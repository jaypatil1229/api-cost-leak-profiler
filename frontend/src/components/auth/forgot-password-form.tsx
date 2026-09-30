"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrototypeNotice } from "./auth-shell";

const schema = z.object({ email: z.string().email("Enter a valid email address.") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  if (submittedEmail) {
    return (
      <div className="flex flex-col gap-6">
        <PrototypeNotice />
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          <MailCheckIcon aria-hidden="true" className="size-5 text-primary" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Reset link prepared for {submittedEmail}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              In a real deployment this would start a password reset. This prototype does not send email and no account was looked up.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => setSubmittedEmail(null)}>
            Use a different email
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PrototypeNotice />
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => setSubmittedEmail(values.email))} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email">Work email</Label>
          <Input id="forgot-email" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email ? <p className="text-xs text-destructive">{form.formState.errors.email.message}</p> : null}
        </div>
        <Button type="submit" className="mt-2">
          Send reset instructions
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        <Link className="text-foreground underline-offset-4 hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
