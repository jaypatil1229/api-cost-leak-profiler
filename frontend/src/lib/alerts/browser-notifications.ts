export type AlertNotificationStatus = "OPEN" | "ACKNOWLEDGED";
export type AlertNotificationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AlertNotificationPreferences {
  enabled: boolean;
  minimumSeverity: AlertNotificationSeverity;
  statuses: AlertNotificationStatus[];
  enabledAt: number | null;
}

export interface AlertNotificationCandidate {
  id: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
}

export interface BrowserNotificationLike {
  onclick: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  close(): void;
}

export type BrowserNotificationFactory = (
  title: string,
  options: { body: string; tag: string },
) => BrowserNotificationLike;

export type BrowserNotificationCapability = "unsupported" | "denied" | "permission-needed" | "available";

export const DEFAULT_ALERT_NOTIFICATION_PREFERENCES: AlertNotificationPreferences = {
  enabled: false,
  minimumSeverity: "HIGH",
  statuses: ["OPEN"],
  enabledAt: null,
};

const severityRank: Record<AlertNotificationSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const severityValues = Object.keys(severityRank) as AlertNotificationSeverity[];
const statusValues: AlertNotificationStatus[] = ["OPEN", "ACKNOWLEDGED"];

export function parseAlertNotificationPreferences(
  stored: string | null,
): AlertNotificationPreferences {
  if (!stored) return { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES };
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES };
    const candidate = value as Partial<AlertNotificationPreferences>;
    return {
      enabled: candidate.enabled === true,
      minimumSeverity: severityValues.includes(candidate.minimumSeverity as AlertNotificationSeverity)
        ? (candidate.minimumSeverity as AlertNotificationSeverity)
        : DEFAULT_ALERT_NOTIFICATION_PREFERENCES.minimumSeverity,
      statuses: Array.isArray(candidate.statuses)
        ? statusValues.filter((status) => candidate.statuses?.includes(status))
        : [...DEFAULT_ALERT_NOTIFICATION_PREFERENCES.statuses],
      enabledAt: typeof candidate.enabledAt === "number" ? candidate.enabledAt : null,
    };
  } catch {
    return { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES };
  }
}

export function collectNewAlertNotifications(
  alerts: AlertNotificationCandidate[],
  seenIds: ReadonlySet<string>,
  preferences: AlertNotificationPreferences,
  observingSince: number,
): { seenIds: Set<string>; notifications: AlertNotificationCandidate[] } {
  const nextSeenIds = new Set(seenIds);
  const notifications: AlertNotificationCandidate[] = [];
  const notifySince = Math.max(observingSince, preferences.enabledAt ?? observingSince);
  const minimumSeverity = severityRank[preferences.minimumSeverity];

  for (const alert of alerts) {
    if (nextSeenIds.has(alert.id)) continue;
    nextSeenIds.add(alert.id);

    if (!preferences.enabled || !preferences.statuses.includes(alert.status as AlertNotificationStatus))
      continue;
    if (!(alert.severity in severityRank) || severityRank[alert.severity as AlertNotificationSeverity] < minimumSeverity)
      continue;
    const createdAt = Date.parse(alert.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < notifySince) continue;
    notifications.push(alert);
  }

  return { seenIds: nextSeenIds, notifications };
}

export function alertNotificationHref(alertId: string): string {
  return `/alerts?highlight=${encodeURIComponent(alertId)}`;
}

export function getBrowserNotificationCapability(
  supported: boolean,
  permission: string | null,
): BrowserNotificationCapability {
  if (!supported) return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "granted") return "available";
  return "permission-needed";
}

export function deliverBrowserAlertNotification(
  alert: AlertNotificationCandidate,
  createNotification: BrowserNotificationFactory,
  navigate: (href: string) => void,
  onError: () => void,
): boolean {
  try {
    const notification = createNotification(alert.title, {
      body: `${alert.severity} · ${alert.message}`.slice(0, 180),
      tag: `aclp-alert-${alert.id}`,
    });
    notification.onclick = () => {
      notification.close();
      navigate(alertNotificationHref(alert.id));
    };
    notification.onerror = () => onError();
    return true;
  } catch {
    onError();
    return false;
  }
}
