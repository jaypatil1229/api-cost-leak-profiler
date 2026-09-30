import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Get started" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your workspace"
      description="Set up a sample workspace and walk through organization, project, and SDK onboarding."
      footer={<span>Demo flow — no account is created and no email is sent.</span>}
    >
      <SignUpForm />
    </AuthShell>
  );
}
