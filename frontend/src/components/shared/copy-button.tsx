"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copy",
  successMessage = "Copied to clipboard",
  variant = "outline",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  successMessage?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(successMessage);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Your browser blocked clipboard access. Select the text and copy it manually.");
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleCopy} className={className}>
      {copied ? <CheckIcon data-icon="inline-start" aria-hidden="true" /> : <CopyIcon data-icon="inline-start" aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
