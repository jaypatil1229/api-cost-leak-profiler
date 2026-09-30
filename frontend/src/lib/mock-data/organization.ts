import type { Organization } from "@/types/domain";
import { USERS } from "./catalog";
import { ORGANIZATION_ID } from "./projects";

const ROLES = ["owner", "admin", "developer", "analyst", "viewer", "developer", "analyst", "developer", "viewer", "analyst", "developer", "viewer"] as const;
const JOINED = [
  "2026-01-08T09:00:00.000Z", "2026-01-08T09:05:00.000Z", "2026-02-01T10:15:00.000Z", "2026-03-14T08:45:00.000Z",
  "2026-04-02T13:20:00.000Z", "2026-04-21T11:10:00.000Z", "2026-05-09T09:40:00.000Z", "2026-05-28T15:55:00.000Z",
  "2026-06-15T10:05:00.000Z", "2026-07-03T14:30:00.000Z", "2026-07-22T09:25:00.000Z", "2026-08-30T16:45:00.000Z",
] as const;

export const ORGANIZATION: Organization = {
  id: ORGANIZATION_ID,
  name: "Northwind Labs",
  slug: "northwind-labs",
  domain: "northwind.example",
  plan: "Scale (sample plan)",
  createdAt: "2026-01-08T09:00:00.000Z",
  region: "eu-west-1",
  members: USERS.map((user, index) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: ROLES[index] ?? "viewer",
    status: "active",
    joinedAt: JOINED[index] ?? "2026-08-30T16:45:00.000Z",
    lastActiveAt: `2026-09-${String(28 + (index % 3)).padStart(2, "0")}T${String(8 + (index % 9)).padStart(2, "0")}:12:00.000Z`,
    avatarInitials: user.initials,
  })),
  invitations: [
    { id: "inv_01", email: "nadia.rahman@northwind.example", role: "analyst", invitedBy: "Asha Yadav", sentAt: "2026-09-27T10:12:00.000Z", status: "pending" },
    { id: "inv_02", email: "contractor@studio.example", role: "viewer", invitedBy: "Marcus Oyelaran", sentAt: "2026-09-22T14:40:00.000Z", status: "pending" },
  ],
  auditLog: [
    { id: "aud_01", actorName: "Asha Yadav", action: "Updated alert threshold", target: "Daily spend increase → 25%", occurredAt: "2026-09-29T11:02:00.000Z", category: "settings" },
    { id: "aud_02", actorName: "Marcus Oyelaran", action: "Rotated ingest key", target: "Reports export", occurredAt: "2026-09-26T08:12:00.000Z", category: "security" },
    { id: "aud_03", actorName: "Priya Nandakumar", action: "Resolved alert", target: "Staging request budget", occurredAt: "2026-09-25T16:35:00.000Z", category: "membership" },
    { id: "aud_04", actorName: "Asha Yadav", action: "Invited member", target: "nadia.rahman@northwind.example", occurredAt: "2026-09-27T10:12:00.000Z", category: "membership" },
    { id: "aud_05", actorName: "Tomas Vidal", action: "Enabled SDK version", target: "@aclp/sdk 0.4.0-rc.2", occurredAt: "2026-09-21T09:48:00.000Z", category: "settings" },
    { id: "aud_06", actorName: "Elena Sartori", action: "Updated pricing estimate", target: "Gemini 2.0 Flash output rate", occurredAt: "2026-09-19T13:26:00.000Z", category: "settings" },
    { id: "aud_07", actorName: "Marcus Oyelaran", action: "Connected provider", target: "Google", occurredAt: "2026-02-19T14:05:00.000Z", category: "settings" },
    { id: "aud_08", actorName: "Asha Yadav", action: "Changed retention", target: "Request detail → 30 days", occurredAt: "2026-09-12T15:10:00.000Z", category: "security" },
    { id: "aud_09", actorName: "Jonah Bright", action: "Acknowledged alert", target: "Duplicate campaign prompts", occurredAt: "2026-09-11T10:02:00.000Z", category: "settings" },
    { id: "aud_10", actorName: "Asha Yadav", action: "Created project", target: "Internal tools", occurredAt: "2026-05-02T10:00:00.000Z", category: "settings" },
  ],
  billing: {
    planName: "Scale (sample plan)",
    billingStatus: "Placeholder — no billing provider connected",
    seats: { used: 12, included: 25 },
    renewsOn: "2026-10-08",
    isConnected: false,
    note: "Billing is not connected in this prototype. No invoices, payment methods, or usage-based charges are real.",
  },
};

export const CURRENT_USER = {
  id: "usr_ay",
  name: "Asha Yadav",
  email: "asha@northwind.example",
  role: "owner" as const,
  initials: "AY",
  title: "Platform lead",
};
