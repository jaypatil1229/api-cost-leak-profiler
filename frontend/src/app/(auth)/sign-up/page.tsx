import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your ACLP account" description="Create an account, then add an organization project to start collecting telemetry.">
      <SignUpForm />
    </AuthShell>
  );
}
