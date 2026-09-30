"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const TOPICS = [
  { value: "product", label: "Product question" },
  { value: "telemetry", label: "Telemetry and data handling" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
] as const;

const schema = z.object({
  name: z.string().min(2, "Enter at least two characters."),
  email: z.string().email("Enter an email address in the form name@example.com."),
  company: z.string().min(2, "Enter your organisation name."),
  topic: z.enum(["product", "telemetry", "partnership", "other"]),
  message: z.string().min(20, "Give us at least a sentence so the reply is useful."),
});

type ContactValues = z.infer<typeof schema>;

export function ContactForm() {
  const [submitted, setSubmitted] = React.useState<ContactValues | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", company: "", topic: "product", message: "" },
  });

  const topic = watch("topic");

  async function onSubmit(values: ContactValues) {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    setSubmitted(values);
  }

  if (submitted) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-xl border border-success/30 bg-success-soft p-6">
        <CheckCircle2Icon aria-hidden="true" className="size-5 text-success" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-medium tracking-tight">Message captured locally</h2>
          <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            Nothing was sent. This prototype has no backend and no email delivery, so your message stayed in this browser tab. In a real
            deployment this is where a confirmation would arrive at {submitted.email}.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => {
            setSubmitted(null);
            reset();
          }}
        >
          Write another message
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      aria-label="Contact ACLP"
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="contact-name">Name</FieldLabel>
            <Input id="contact-name" autoComplete="name" aria-invalid={Boolean(errors.name) || undefined} {...register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.email) || undefined}>
            <FieldLabel htmlFor="contact-email">Work email</FieldLabel>
            <Input id="contact-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email) || undefined} {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.company) || undefined}>
            <FieldLabel htmlFor="contact-company">Organisation</FieldLabel>
            <Input id="contact-company" autoComplete="organization" aria-invalid={Boolean(errors.company) || undefined} {...register("company")} />
            <FieldError>{errors.company?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="contact-topic">Topic</FieldLabel>
            <Select value={topic} onValueChange={(value) => setValue("topic", value as ContactValues["topic"], { shouldValidate: true })}>
              <SelectTrigger id="contact-topic" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TOPICS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.message) || undefined}>
          <FieldLabel htmlFor="contact-message">Message</FieldLabel>
          <Textarea id="contact-message" rows={6} aria-invalid={Boolean(errors.message) || undefined} {...register("message")} />
          <FieldDescription>
            Tell us what you are trying to understand about your AI spend. Please do not include API keys or customer data.
          </FieldDescription>
          <FieldError>{errors.message?.message}</FieldError>
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Capturing…" : "Send message"}
        </Button>
        <p className="text-xs text-muted-foreground">Nothing is transmitted. This form is a local simulation.</p>
      </div>
    </form>
  );
}
