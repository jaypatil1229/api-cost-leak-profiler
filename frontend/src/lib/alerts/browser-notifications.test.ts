import assert from "node:assert/strict";
import test from "node:test";

import {
  alertNotificationHref,
  collectNewAlertNotifications,
  DEFAULT_ALERT_NOTIFICATION_PREFERENCES,
  deliverBrowserAlertNotification,
  getBrowserNotificationCapability,
  parseAlertNotificationPreferences,
  type AlertNotificationCandidate,
} from "./browser-notifications";

const alert = (overrides: Partial<AlertNotificationCandidate> = {}): AlertNotificationCandidate => ({
  id: "alert-1",
  title: "Spend spike detected",
  message: "Project spend rose above its baseline.",
  severity: "HIGH",
  status: "OPEN",
  createdAt: new Date(10_000).toISOString(),
  ...overrides,
});

test("browser notifications are limited to newly observed qualifying alert IDs", () => {
  const first = collectNewAlertNotifications([alert()], new Set(), {
    ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES,
    enabled: true,
    enabledAt: 9_000,
  }, 8_000);
  assert.deepEqual(first.notifications.map((item) => item.id), ["alert-1"]);

  const repeated = collectNewAlertNotifications([alert()], first.seenIds, {
    ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES,
    enabled: true,
    enabledAt: 9_000,
  }, 8_000);
  assert.deepEqual(repeated.notifications, []);

  const reordered = collectNewAlertNotifications(
    [alert({ id: "alert-2", createdAt: new Date(11_000).toISOString() }), alert()],
    repeated.seenIds,
    { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES, enabled: true, enabledAt: 9_000 },
    8_000,
  );
  assert.deepEqual(reordered.notifications.map((item) => item.id), ["alert-2"]);
});

test("disabled, historical, low-severity, and unselected-status alerts stay quiet", () => {
  const alerts = [
    alert({ id: "historical", createdAt: new Date(5_000).toISOString() }),
    alert({ id: "low", severity: "LOW" }),
    alert({ id: "resolved", status: "RESOLVED" }),
  ];
  const enabled = collectNewAlertNotifications(
    alerts,
    new Set(),
    { ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES, enabled: true, enabledAt: 8_000 },
    7_000,
  );
  assert.deepEqual(enabled.notifications, []);
  assert.equal(enabled.seenIds.size, 3);

  const disabled = collectNewAlertNotifications(
    [alert({ id: "disabled" })],
    new Set(),
    DEFAULT_ALERT_NOTIFICATION_PREFERENCES,
    8_000,
  );
  assert.deepEqual(disabled.notifications, []);
});

test("notification preferences are parsed defensively and scoped preferences can select statuses", () => {
  const parsed = parseAlertNotificationPreferences(JSON.stringify({
    enabled: true,
    minimumSeverity: "MEDIUM",
    statuses: ["OPEN", "INVALID"],
    enabledAt: 1234,
  }));
  assert.deepEqual(parsed, {
    enabled: true,
    minimumSeverity: "MEDIUM",
    statuses: ["OPEN"],
    enabledAt: 1234,
  });
  assert.equal(parseAlertNotificationPreferences("not-json").enabled, false);
});

test("permission capability explains unsupported, denied, and user-action states", () => {
  assert.equal(getBrowserNotificationCapability(false, null), "unsupported");
  assert.equal(getBrowserNotificationCapability(true, "denied"), "denied");
  assert.equal(getBrowserNotificationCapability(true, "default"), "permission-needed");
  assert.equal(getBrowserNotificationCapability(true, "granted"), "available");
});

test("notification clicks link to the selected ACLP alert", () => {
  assert.equal(alertNotificationHref("alert/with spaces"), "/alerts?highlight=alert%2Fwith%20spaces");
});

test("a permitted new alert creates one browser notification and click opens that alert", () => {
  const item = alert({ id: "alert-click" });
  const seen = collectNewAlertNotifications([item], new Set(), {
    ...DEFAULT_ALERT_NOTIFICATION_PREFERENCES,
    enabled: true,
    enabledAt: 9_000,
  }, 8_000);
  const factory = (title: string, options: { body: string; tag: string }) => {
    let click: ((event: Event) => unknown) | null = null;
    let error: ((event: Event) => unknown) | null = null;
    let closed = false;
    const notification = {
      get onclick() { return click; },
      set onclick(value: ((event: Event) => unknown) | null) { click = value; },
      get onerror() { return error; },
      set onerror(value: ((event: Event) => unknown) | null) { error = value; },
      close() { closed = true; },
    };
    created.push({ title, options, notification, click: () => click?.({} as Event), isClosed: () => closed });
    return notification;
  };
  const created: Array<{ title: string; options: { body: string; tag: string }; notification: { onclick: ((event: Event) => unknown) | null; onerror: ((event: Event) => unknown) | null; close(): void }; click(): void; isClosed(): boolean }> = [];
  const navigations: string[] = [];
  for (const notification of seen.notifications) {
    assert.equal(deliverBrowserAlertNotification(notification, factory, (href) => navigations.push(href), () => assert.fail("unexpected notification error")), true);
  }
  assert.equal(created.length, 1);
  assert.equal(created[0].title, item.title);
  assert.equal(created[0].options.tag, `aclp-alert-${item.id}`);
  created[0].click();
  assert.equal(created[0].isClosed(), true);
  assert.deepEqual(navigations, ["/alerts?highlight=alert-click"]);
});

test("notification delivery failures are surfaced", () => {
  let failed = false;
  const delivered = deliverBrowserAlertNotification(
    alert(),
    () => { throw new Error("browser denied notification"); },
    () => assert.fail("notification must not navigate"),
    () => { failed = true; },
  );
  assert.equal(delivered, false);
  assert.equal(failed, true);

  let asynchronouslyFailed = false;
  const notification = {
    onclick: null as ((event: Event) => unknown) | null,
    onerror: null as ((event: Event) => unknown) | null,
    close() {},
  };
  assert.equal(deliverBrowserAlertNotification(alert(), () => notification, () => {}, () => { asynchronouslyFailed = true; }), true);
  notification.onerror?.({} as Event);
  assert.equal(asynchronouslyFailed, true);
});
