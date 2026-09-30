"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CreditCardIcon, MailIcon, ShieldCheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { SampleDataNotice } from "@/components/shared/empty-state";
import { useUrlState } from "@/hooks/use-url-state";
import { getOrganization } from "@/lib/mock-services/repository";
import { CURRENT_USER } from "@/lib/mock-data/organization";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { AuditLogEntry, Invitation, MemberRole, OrganizationMember } from "@/types/domain";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  developer: "Developer",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: { role: MemberRole; description: string }[] = [
  { role: "owner", description: "Full control including billing, organization settings, and ownership transfer." },
  { role: "admin", description: "Manages projects, members, integrations, and settings. Cannot transfer ownership." },
  { role: "developer", description: "Reads usage data and manages project-level configuration and ingest keys." },
  { role: "analyst", description: "Reads analytics, findings, alerts, and reports. No configuration access." },
  { role: "viewer", description: "Read-only access to dashboards and reports." },
];

const INVITE_ROLES: MemberRole[] = ["admin", "analyst", "developer", "viewer"];

const AUDIT_CATEGORIES = ["membership", "settings", "security", "billing"] as const;

const profileSchema = z.object({
  name: z.string().min(2, "Organization name needs at least 2 characters."),
  slug: z
    .string()
    .min(2, "Slug needs at least 2 characters.")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain such as northwind.example."),
});

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["admin", "analyst", "developer", "viewer"]),
});

type InviteValues = z.infer<typeof inviteSchema>;

export function OrganizationSettingsView() {
  const { get, setParams } = useUrlState();
  const organization = React.useMemo(() => getOrganization(), []);

  const [profile, setProfile] = React.useState({
    name: organization.name,
    slug: organization.slug,
    domain: organization.domain,
    region: organization.region,
  });
  const [profileErrors, setProfileErrors] = React.useState<Record<string, string>>({});
  const [members, setMembers] = React.useState<OrganizationMember[]>(organization.members);
  const [invitations, setInvitations] = React.useState<Invitation[]>(organization.invitations);

  const auditCategory = get("audit");
  const auditLog = React.useMemo<AuditLogEntry[]>(
    () => (auditCategory ? organization.auditLog.filter((entry) => entry.category === auditCategory) : organization.auditLog),
    [organization.auditLog, auditCategory],
  );

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "analyst" },
  });

  function saveProfile() {
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] = issue.message;
      setProfileErrors(nextErrors);
      toast.error("Organization profile needs attention", { description: "Check the highlighted fields and save again." });
      return;
    }
    setProfileErrors({});
    toast.success("Organization profile saved locally", { description: "This prototype does not update a backend." });
  }

  function onInvite(values: InviteValues) {
    setInvitations((current) => [
      {
        id: "inv_local_" + (current.length + 1),
        email: values.email,
        role: values.role,
        invitedBy: CURRENT_USER.name,
        sentAt: new Date().toISOString(),
        status: "pending",
      },
      ...current,
    ]);
    form.reset();
    toast.success("Invitation added to the pending list", {
      description: "No email is sent. This entry exists only in your browser.",
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Organization settings"
        description="Profile, members, roles, invitations, audit history, and billing for the sample organization. Nothing here contacts a backend or sends mail."
      />

      <section aria-labelledby="profile-heading" className="flex flex-col gap-5">
        <SectionHeading title="Organization profile" description="How this workspace is identified across ACLP." />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              value={profile.name}
              aria-invalid={Boolean(profileErrors.name)}
              aria-describedby={profileErrors.name ? "org-name-error" : undefined}
              onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
            />
            {profileErrors.name ? (
              <p id="org-name-error" className="text-xs text-destructive">
                {profileErrors.name}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-slug">Workspace slug</Label>
            <Input
              id="org-slug"
              value={profile.slug}
              aria-invalid={Boolean(profileErrors.slug)}
              aria-describedby={profileErrors.slug ? "org-slug-error" : undefined}
              onChange={(event) => setProfile((current) => ({ ...current, slug: event.target.value }))}
            />
            {profileErrors.slug ? (
              <p id="org-slug-error" className="text-xs text-destructive">
                {profileErrors.slug}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Used in URLs and the workspace switcher.</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-domain">Primary domain</Label>
            <Input
              id="org-domain"
              value={profile.domain}
              aria-invalid={Boolean(profileErrors.domain)}
              aria-describedby={profileErrors.domain ? "org-domain-error" : undefined}
              onChange={(event) => setProfile((current) => ({ ...current, domain: event.target.value }))}
            />
            {profileErrors.domain ? (
              <p id="org-domain-error" className="text-xs text-destructive">
                {profileErrors.domain}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-region">Data region</Label>
            <Select value={profile.region} onValueChange={(value) => setProfile((current) => ({ ...current, region: value }))}>
              <SelectTrigger id="org-region" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                  <SelectItem value="us-east-1">us-east-1</SelectItem>
                  <SelectItem value="ap-south-1">ap-south-1</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Region selection is a placeholder; no data is stored anywhere.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={saveProfile}>
            Save profile
          </Button>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(organization.createdAt)} · plan {organization.plan}
          </p>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="members-heading" className="flex flex-col gap-5">
        <SectionHeading
          title={"Members (" + members.length + ")"}
          description="Sample teammates with roles. Changing a role updates this browser only."
        />
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Member</TableHead>
                <TableHead scope="col">Role</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Joined</TableHead>
                <TableHead scope="col">Last active</TableHead>
                <TableHead scope="col" className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{member.avatarInitials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{member.name}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) => {
                        setMembers((current) =>
                          current.map((entry) => (entry.id === member.id ? { ...entry, role: value as MemberRole } : entry)),
                        );
                        toast.success(member.name + " is now " + ROLE_LABELS[value as MemberRole] + " in this draft");
                      }}
                    >
                      <SelectTrigger size="sm" className="w-36" aria-label={"Role for " + member.name}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(Object.keys(ROLE_LABELS) as MemberRole[]).map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-success/35 bg-success-soft font-normal text-success">
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(member.joinedAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(member.lastActiveAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={member.role === "owner"}
                      onClick={() => {
                        setMembers((current) => current.filter((entry) => entry.id !== member.id));
                        toast.success(member.name + " removed from this draft");
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="roles-heading" className="flex flex-col gap-5">
        <SectionHeading title="Roles" description="What each role can do in this prototype." />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_DESCRIPTIONS.map((entry) => (
            <li key={entry.role} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheckIcon aria-hidden="true" className="size-4 text-primary" />
                {ROLE_LABELS[entry.role]}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">{entry.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <section aria-labelledby="invitations-heading" className="flex flex-col gap-5">
        <SectionHeading
          title="Invitations"
          description="Validate the form to see how inviting works. Submitting adds a pending row locally and never sends an email."
        />
        <form
          className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
          onSubmit={form.handleSubmit(onInvite)}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input id="invite-email" type="email" placeholder="teammate@northwind.example" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={form.watch("role")} onValueChange={(value) => form.setValue("role", value as InviteValues["role"])}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {INVITE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm">
            <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
            Add invitation
          </Button>
        </form>

        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <MailIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm">{invitation.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABELS[invitation.role]} · invited by {invitation.invitedBy} · {formatRelativeTime(invitation.sentAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Not sent
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={"Cancel invitation for " + invitation.email}
                    onClick={() => {
                      setInvitations((current) => current.filter((entry) => entry.id !== invitation.id));
                      toast.success("Invitation removed from the pending list");
                    }}
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                    <span className="sr-only">Cancel invitation</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section aria-labelledby="audit-heading" className="flex flex-col gap-5">
        <SectionHeading title="Audit log" description="Sample events recorded against this organization." />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={auditCategory ? "outline" : "secondary"}
            size="sm"
            onClick={() => setParams({ audit: null }, { replace: true })}
          >
            All
          </Button>
          {AUDIT_CATEGORIES.map((category) => (
            <Button
              key={category}
              variant={auditCategory === category ? "secondary" : "outline"}
              size="sm"
              className="capitalize"
              onClick={() => setParams({ audit: category }, { replace: true })}
            >
              {category}
            </Button>
          ))}
        </div>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {auditLog.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">
                  <span className="font-medium">{entry.actorName}</span> {entry.action.toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground">{entry.target}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.occurredAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <section aria-labelledby="billing-heading" className="flex flex-col gap-5">
        <SectionHeading title="Billing" description="Placeholder only — no billing provider is connected." />
        <div className={cn("flex flex-col gap-4 rounded-xl border border-dashed border-border bg-muted/40 p-6")}>
          <div className="flex flex-wrap items-center gap-3">
            <CreditCardIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">{organization.billing.planName}</span>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Not connected
            </Badge>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Seats</dt>
              <dd className="number text-lg font-medium">
                {organization.billing.seats.used} of {organization.billing.seats.included}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Would renew</dt>
              <dd className="text-lg font-medium">{formatDate(organization.billing.renewsOn)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="text-sm">{organization.billing.billingStatus}</dd>
            </div>
          </dl>
          <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">{organization.billing.note}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled>
              Manage payment method
            </Button>
            <Button variant="ghost" size="sm" disabled>
              Download invoice
            </Button>
            <span className="self-center text-xs text-muted-foreground">Coming soon</span>
          </div>
        </div>
      </section>

      <SampleDataNotice>
        Members, invitations, audit events, and billing details are sample records. Actions on this page change local component state so you can
        see the interaction; nothing is written to a database or sent by email.
      </SampleDataNotice>
    </>
  );
}
