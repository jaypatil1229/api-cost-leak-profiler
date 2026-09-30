export type MemberRole = "owner" | "admin" | "analyst" | "developer" | "viewer";

export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: "active" | "invited" | "suspended";
  joinedAt: string;
  lastActiveAt: string;
  avatarInitials: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  sentAt: string;
  status: "pending" | "accepted" | "expired";
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  target: string;
  occurredAt: string;
  category: "membership" | "settings" | "security" | "billing";
}

export interface BillingPlaceholder {
  planName: string;
  billingStatus: string;
  seats: { used: number; included: number };
  renewsOn: string;
  isConnected: boolean;
  note: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string;
  plan: string;
  createdAt: string;
  region: string;
  members: OrganizationMember[];
  invitations: Invitation[];
  auditLog: AuditLogEntry[];
  billing: BillingPlaceholder;
}
