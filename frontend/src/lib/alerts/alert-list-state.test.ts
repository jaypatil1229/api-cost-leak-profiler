import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ALERT_LIST_FILTERS,
  parseAlertListFilters,
  serializeAlertListFilters,
} from "./alert-list-state";

test("alert lists default to recently updated without discarding valid URL filters", () => {
  assert.deepEqual(parseAlertListFilters(""), DEFAULT_ALERT_LIST_FILTERS);
  assert.deepEqual(parseAlertListFilters("?status=OPEN&severity=HIGH&sort=createdAt&page=3"), {
    page: 3,
    status: "OPEN",
    severity: "HIGH",
    sortBy: "createdAt",
  });
});

test("filter serialization survives a refresh and preserves notification highlight", () => {
  const search = serializeAlertListFilters("?highlight=alert-123&campaign=keep", {
    page: 2,
    status: "ACKNOWLEDGED",
    severity: "CRITICAL",
    sortBy: "severity",
  });
  assert.deepEqual(parseAlertListFilters(search), {
    page: 2,
    status: "ACKNOWLEDGED",
    severity: "CRITICAL",
    sortBy: "severity",
  });
  assert.equal(new URLSearchParams(search).get("highlight"), "alert-123");
  assert.equal(new URLSearchParams(search).get("campaign"), "keep");
});

test("invalid filters are rejected and returning to defaults removes filter parameters", () => {
  assert.deepEqual(parseAlertListFilters("?status=INVALID&severity=URGENT&sort=unknown&page=-1"), DEFAULT_ALERT_LIST_FILTERS);
  assert.equal(serializeAlertListFilters("?status=OPEN&sort=severity&page=4&highlight=x", DEFAULT_ALERT_LIST_FILTERS), "?highlight=x");
});
