"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex flex-col gap-5", className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" role="group" className={cn("group/field flex flex-col gap-2", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("text-sm font-medium text-foreground", className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null
  return (
    <p data-slot="field-error" role="alert" className={cn("text-sm font-medium text-destructive", className)} {...props}>
      {children}
    </p>
  )
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel }
