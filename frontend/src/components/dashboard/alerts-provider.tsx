"use client";

import * as React from "react";
import { toast } from "sonner";
import { apiRequest, queryString } from "@/lib/api/client";
import { useApiQuery } from "@/hooks/use-api-query";
import type { Alert, Page } from "@/lib/api/types";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { useSession } from "@/components/auth/session-provider";
import {
  collectNewAlertNotifications,
  deliverBrowserAlertNotification,
  getBrowserNotificationCapability,
  parseAlertNotificationPreferences,
  type AlertNotificationPreferences,
  type AlertNotificationSeverity,
  type AlertNotificationStatus,
} from "@/lib/alerts/browser-notifications";

type NotificationPermissionState = NotificationPermission | "unsupported";

interface AlertsApi {
  alerts: Alert[];
  counts: { active: number; acknowledged: number; resolved: number; total: number };
  error: string | null;
  setStatus(id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED"): Promise<void>;
  acknowledgeAll(): Promise<void>;
  browserNotifications: {
    supported: boolean;
    permission: NotificationPermissionState;
    preferences: AlertNotificationPreferences;
    feedback: string | null;
    enable(): Promise<void>;
    disable(): void;
    setMinimumSeverity(severity: AlertNotificationSeverity): void;
    setStatusEnabled(status: AlertNotificationStatus, enabled: boolean): void;
  };
}

const AlertsContext = React.createContext<AlertsApi | null>(null);
const NOTIFICATION_PREFERENCE_PREFIX = "aclp.browser-alert-notifications.v1";
const ALERT_PREFERENCES_CHANGED_EVENT = "aclp:alert-notification-preferences-changed";
const BROWSER_PERMISSION_CHANGED_EVENT = "aclp:browser-notification-permission-changed";

function subscribeToBrowserNotificationPermission(onChange: () => void) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener(BROWSER_PERMISSION_CHANGED_EVENT, onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener(BROWSER_PERMISSION_CHANGED_EVENT, onChange);
  };
}

function readBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function subscribeToStoredPreferences(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(ALERT_PREFERENCES_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ALERT_PREFERENCES_CHANGED_EVENT, onChange);
  };
}

function readStoredPreferences(key: string | null): string | null {
  if (!key || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { organization, project } = useWorkspace();
  const { user } = useSession();
  const result = useApiQuery<Page<Alert>>(
    organization && project
      ? `/organizations/${organization.id}/alerts${queryString({ projectId: project.id, limit: 10 })}`
      : null,
  );
  // Monitor a larger, unfiltered first page globally so notifications work on
  // every authenticated dashboard route, not only while /alerts is open.
  const monitor = useApiQuery<Page<Alert>>(
    organization && project
      ? `/organizations/${organization.id}/alerts${queryString({ projectId: project.id, limit: 100, sortBy: "updatedAt" })}`
      : null,
  );
  const alerts = React.useMemo(() => result.data?.items ?? [], [result.data]);
  const reload = result.reload;
  const notificationReload = monitor.reload;
  const preferenceKey = user && organization && project
    ? `${NOTIFICATION_PREFERENCE_PREFIX}:${user.id}:${organization.id}:${project.id}`
    : null;
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [ephemeralPreferences, setEphemeralPreferences] = React.useState<{
    key: string;
    value: AlertNotificationPreferences;
  } | null>(null);
  const observed = React.useRef<{
    key: string | null;
    since: number;
    seenIds: Set<string>;
  }>({ key: null, since: 0, seenIds: new Set() });
  const permission = React.useSyncExternalStore(
    subscribeToBrowserNotificationPermission,
    readBrowserNotificationPermission,
    () => "unsupported" as const,
  );
  const getPreferenceSnapshot = React.useCallback(() => readStoredPreferences(preferenceKey), [preferenceKey]);
  const storedPreferences = React.useSyncExternalStore(
    subscribeToStoredPreferences,
    getPreferenceSnapshot,
    () => null,
  );
  const preferences = ephemeralPreferences?.key === preferenceKey
    ? ephemeralPreferences.value
    : parseAlertNotificationPreferences(storedPreferences);

  React.useEffect(() => {
    if (observed.current.key === preferenceKey) return;
    observed.current = { key: preferenceKey, since: Date.now(), seenIds: new Set() };
  }, [preferenceKey]);

  React.useEffect(() => {
    if (!preferenceKey || !monitor.data) return;
    if (observed.current.key !== preferenceKey) {
      observed.current = { key: preferenceKey, since: Date.now(), seenIds: new Set() };
    }
    const result = collectNewAlertNotifications(
      monitor.data.items,
      observed.current.seenIds,
      preferences,
      observed.current.since,
    );
    observed.current.seenIds = result.seenIds;

    if (!preferences.enabled || permission !== "granted") return;
    for (const alert of result.notifications) {
      deliverBrowserAlertNotification(
        alert,
        (title, options) => new window.Notification(title, options),
        (href) => {
          window.focus();
          window.location.assign(href);
        },
        () => setFeedback("A browser notification could not be displayed."),
      );
    }
  }, [monitor.data, preferenceKey, preferences, permission]);

  React.useEffect(() => {
    if (!organization || !project) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        reload();
        notificationReload();
      }
    };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [organization, project, reload, notificationReload]);

  const savePreferences = React.useCallback((next: AlertNotificationPreferences) => {
    if (!preferenceKey) return;
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
      setEphemeralPreferences(null);
      window.dispatchEvent(new Event(ALERT_PREFERENCES_CHANGED_EVENT));
      setFeedback(null);
    } catch {
      setEphemeralPreferences({ key: preferenceKey, value: next });
      setFeedback("Browser storage is unavailable; notification preferences will last only for this session.");
    }
  }, [preferenceKey]);

  const enableNotifications = React.useCallback(async () => {
    const capability = getBrowserNotificationCapability(
      typeof window !== "undefined" && "Notification" in window,
      permission,
    );
    if (capability === "unsupported") {
      setFeedback("This browser does not support notifications. Alerts remain available in ACLP while the app is open.");
      return;
    }
    if (capability === "denied") {
      setFeedback("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
      return;
    }
    let nextPermission = permission;
    if (nextPermission === "default") {
      // This method is called only from the user's Enable notifications button.
      try {
        nextPermission = await window.Notification.requestPermission();
        window.dispatchEvent(new Event(BROWSER_PERMISSION_CHANGED_EVENT));
      } catch {
        setFeedback("The browser could not open its notification permission prompt. Check site settings and try again.");
        return;
      }
    }
    if (nextPermission !== "granted") {
      setFeedback(nextPermission === "denied"
        ? "Notifications were denied. You can change this in your browser's site settings."
        : "Choose Allow in the browser prompt to enable notifications.");
      return;
    }
    savePreferences({ ...preferences, enabled: true, enabledAt: Date.now() });
    setFeedback("Browser notifications are enabled while ACLP is open.");
  }, [permission, preferences, savePreferences]);

  const disableNotifications = React.useCallback(() => {
    savePreferences({ ...preferences, enabled: false, enabledAt: null });
    setFeedback("Browser notifications are disabled.");
  }, [preferences, savePreferences]);

  const setMinimumSeverity = React.useCallback((minimumSeverity: AlertNotificationSeverity) => {
    savePreferences({ ...preferences, minimumSeverity });
  }, [preferences, savePreferences]);

  const setStatusEnabled = React.useCallback((status: AlertNotificationStatus, enabled: boolean) => {
    const statuses = enabled
      ? [...new Set([...preferences.statuses, status])]
      : preferences.statuses.filter((value) => value !== status);
    savePreferences({ ...preferences, statuses });
  }, [preferences, savePreferences]);

  const setStatus = React.useCallback(async (id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") => {
    if (!organization) return;
    try {
      await apiRequest(`/organizations/${organization.id}/alerts/${id}/status`, { method: "PATCH", body: { status } });
      reload();
      notificationReload();
      toast.success("Alert status updated");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update alert");
    }
  }, [organization, reload, notificationReload]);

  const acknowledgeAll = React.useCallback(async () => {
    await Promise.all(alerts.filter((alert) => alert.status === "OPEN").map((alert) => setStatus(alert.id, "ACKNOWLEDGED")));
  }, [alerts, setStatus]);

  const counts = React.useMemo(() => ({
    active: alerts.filter((alert) => alert.status === "OPEN").length,
    acknowledged: alerts.filter((alert) => alert.status === "ACKNOWLEDGED").length,
    resolved: alerts.filter((alert) => alert.status === "RESOLVED").length,
    total: alerts.length,
  }), [alerts]);

  const browserNotifications = React.useMemo(() => ({
    supported: permission !== "unsupported",
    permission,
    preferences,
    feedback,
    enable: enableNotifications,
    disable: disableNotifications,
    setMinimumSeverity,
    setStatusEnabled,
  }), [permission, preferences, feedback, enableNotifications, disableNotifications, setMinimumSeverity, setStatusEnabled]);

  return (
    <AlertsContext.Provider value={{ alerts, counts, error: result.error, setStatus, acknowledgeAll, browserNotifications }}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts() {
  const context = React.useContext(AlertsContext);
  if (!context) throw new Error("useAlerts must be used inside AlertsProvider");
  return context;
}
