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
const MAX_PERSISTED_DELIVERIES = 1_000;

export interface AlertDeliveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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

/** Persist a browser notification claim so reloads do not repeat delivery. */
export function claimBrowserAlertDelivery(
  storage: AlertDeliveryStorage | null,
  storageKey: string,
  alertId: string,
  deliveredAt = Date.now(),
): boolean {
  if (!storage) return true;
  try {
    let parsed: unknown;
    try {
      const stored = storage.getItem(storageKey);
      parsed = stored ? JSON.parse(stored) : [];
    } catch {
      parsed = [];
    }
    const entries = Array.isArray(parsed) ? parsed.filter(isDeliveryEntry) : [];
    if (entries.some((entry) => entry.id === alertId)) return false;
    const next = entries.slice(-(MAX_PERSISTED_DELIVERIES - 1));
    next.push({ id: alertId, deliveredAt });
    storage.setItem(storageKey, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

export function releaseBrowserAlertDeliveryClaim(
  storage: AlertDeliveryStorage | null,
  storageKey: string,
  alertId: string,
): void {
  if (!storage) return;
  try {
    const stored = storage.getItem(storageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return;
    storage.setItem(
      storageKey,
      JSON.stringify(parsed.filter((entry) => !isDeliveryEntry(entry) || entry.id !== alertId)),
    );
  } catch {
    // Storage is best-effort; same-tab notification handling remains active.
  }
}

function isDeliveryEntry(value: unknown): value is { id: string; deliveredAt: number } {
  if (!value || typeof value !== "object") return false;
  const entry = value as { id?: unknown; deliveredAt?: unknown };
  return typeof entry.id === "string" && typeof entry.deliveredAt === "number" && Number.isFinite(entry.deliveredAt);
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
    const notification = createNotification(`New ${alert.severity.toLowerCase()} ACLP alert`, {
      body: "A new alert is ready to review in ACLP.",
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
