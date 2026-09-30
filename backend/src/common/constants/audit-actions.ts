/**
 * Dotted audit action names. Kept as a frozen map rather than a Prisma enum so
 * new actions can be added without a migration, while still being centralised
 * and greppable.
 */
export const AuditAction = {
  // auth
  USER_REGISTERED: 'auth.user.registered',
  USER_LOGGED_IN: 'auth.user.logged_in',
  USER_LOGGED_OUT: 'auth.user.logged_out',
  USER_LOGGED_OUT_ALL: 'auth.user.logged_out_all',
  TOKEN_REFRESHED: 'auth.token.refreshed',
  TOKEN_REUSE_DETECTED: 'auth.token.reuse_detected',

  // organization
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_OWNERSHIP_TRANSFERRED: 'organization.ownership_transferred',

  // membership
  MEMBER_INVITED: 'organization.member.invited',
  MEMBER_INVITATION_REVOKED: 'organization.member.invitation_revoked',
  MEMBER_INVITATION_ACCEPTED: 'organization.member.invitation_accepted',
  MEMBER_REMOVED: 'organization.member.removed',
  MEMBER_ROLE_CHANGED: 'organization.member.role_changed',
  MEMBER_LEFT: 'organization.member.left',

  // project
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_ARCHIVED: 'project.archived',
  PROJECT_RESTORED: 'project.restored',

  // api keys
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  API_KEY_ROTATED: 'api_key.rotated',

  // pricing
  PRICING_CREATED: 'pricing.created',

  // detection / alerts
  ALERT_ACKNOWLEDGED: 'alert.acknowledged',
  ALERT_RESOLVED: 'alert.resolved',
  ALERT_DISMISSED: 'alert.dismissed',
  FINDING_STATUS_CHANGED: 'finding.status_changed',
  DETECTION_RUN_REQUESTED: 'detection.run_requested',

  // reports
  SAVED_REPORT_CREATED: 'report.saved.created',
  SAVED_REPORT_DELETED: 'report.saved.deleted',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
