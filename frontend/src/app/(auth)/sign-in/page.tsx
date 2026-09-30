import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in to ACLP"
      description="Open the sample workspace to explore cost attribution, trends, and leak detection."
      footer={
        <span>
          Looking for the product story first?{" "}
          <Link className="text-foreground underline-offset-4 hover:underline" href="/">
            Back to the marketing site
          </Link>
        </span>
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
