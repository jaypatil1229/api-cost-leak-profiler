import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email you would use and ACLP will show the confirmation state."
      footer={<span>Password recovery is simulated and does not send email.</span>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
