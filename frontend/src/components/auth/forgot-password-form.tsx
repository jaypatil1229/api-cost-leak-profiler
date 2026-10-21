import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
        Password recovery is not available in the backend yet. No reset email was sent. Contact your ACLP administrator to regain access.
      </p>
      <Button asChild variant="outline"><Link href="/sign-in">Back to sign in</Link></Button>
    </div>
  );
}
