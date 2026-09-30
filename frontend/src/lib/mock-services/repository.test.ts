import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampRange,
  getAlerts,
  getAttribution,
  getDefaultRange,
  getFinding,
  getFindings,
  getLedgerBounds,
  getModelMix,
  getRecordsByIds,
  getSummary,
  getTrend,
  listUsage,
} from "./repository";
import { previousWindow } from "./metrics";
import { filterRecords } from "./query";
import { getLedger } from "@/lib/mock-data/ledger";

const ledger = getLedger();
const bounds = getLedgerBounds();
const range = getDefaultRange(30);

describe("sample ledger", () => {
  it("spans the advertised window", () => {
    assert.equal(bounds.to, "2026-09-30");
    assert.ok(ledger.records.length > 50_000, "expected a substantial ledger");
  });

  it("keeps every record internally consistent", () => {
    for (const record of ledger.records) {
      assert.equal(record.inputTokens + record.outputTokens, record.totalTokens, record.id);
      assert.ok(record.inputTokens > 0 && record.outputTokens > 0, record.id);
      assert.ok(record.costUsd > 0, record.id);
      assert.ok(record.latencyMs > 0, record.id);
      assert.ok(record.timestamp.slice(0, 7) >= "2026-07", record.id);
      assert.ok(["openai", "google"].includes(record.providerId), record.id);
    }
  });
});

describe("cost summary", () => {
  const summary = getSummary(range);

  it("reconciles spend with the records in the window", () => {
    const rows = filterRecords(ledger.records, { from: range.from, to: range.to });
    const expected = rows.reduce((total, record) => total + record.costUsd, 0);
    assert.ok(Math.abs(expected - summary.spendUsd) < 0.5, "spend should match the summed ledger");
    assert.equal(summary.requestCount, rows.length);
    assert.ok(Math.abs(summary.averageCostUsd - summary.spendUsd / summary.requestCount) < 0.0005);
    assert.equal(summary.inputTokens + summary.outputTokens, summary.totalTokens);
  });

  it("compares against an equivalent previous window", () => {
    const previous = previousWindow(range);
    const previousSummary = getSummary(previous);
    assert.ok(Math.abs(summary.previousSpendUsd - previousSummary.spendUsd) < 0.5);
    assert.equal(summary.previousRequestCount, previousSummary.requestCount);
    assert.ok(summary.changePct > 20, "the seeded scenario should show a clear increase");
  });
});

describe("trend and attribution", () => {
  it("keeps trend totals aligned with the summary", () => {
    const summary = getSummary(range);
    const trend = getTrend(range, "day");
    const spend = trend.reduce((total, point) => total + point.spendUsd, 0);
    const requests = trend.reduce((total, point) => total + point.requests, 0);
    assert.ok(Math.abs(spend - summary.spendUsd) < 0.5);
    assert.equal(requests, summary.requestCount);
    for (const point of trend) {
      assert.equal(point.inputTokens + point.outputTokens, point.totalTokens, point.label);
    }
  });

  it("makes every attribution dimension reconcile to the same total", () => {
    const summary = getSummary(range);
    for (const dimension of ["feature", "model", "provider", "environment"] as const) {
      const rows = getAttribution(range, dimension);
      const spend = rows.reduce((total, row) => total + row.spendUsd, 0);
      const requests = rows.reduce((total, row) => total + row.requestCount, 0);
      assert.ok(Math.abs(spend - summary.spendUsd) < 0.5, dimension + " spend");
      assert.equal(requests, summary.requestCount, dimension + " requests");
      const share = rows.reduce((total, row) => total + row.sharePct, 0);
      assert.ok(Math.abs(share - 100) < 0.5, dimension + " share");
    }
  });

  it("agrees between model attribution and the model mix", () => {
    const attribution = getAttribution(range, "model");
    const mix = getModelMix(range);
    assert.equal(attribution.length, mix.length);
    const mixSpend = mix.reduce((total, point) => total + point.spendUsd, 0);
    const attributionSpend = attribution.reduce((total, row) => total + row.spendUsd, 0);
    assert.ok(Math.abs(mixSpend - attributionSpend) < 0.5);
  });
});

describe("usage query", () => {
  it("paginates without overlap", () => {
    const first = listUsage({ from: range.from, to: range.to, page: 1, pageSize: 25 });
    const second = listUsage({ from: range.from, to: range.to, page: 2, pageSize: 25 });
    assert.equal(first.rows.length, 25);
    assert.equal(second.rows.length, 25);
    const overlap = first.rows.filter((row) => second.rows.some((other) => other.id === row.id));
    assert.equal(overlap.length, 0);
    assert.ok(first.pageCount > 1);
  });

  it("honours filters and ordering", () => {
    const errors = listUsage({ from: range.from, to: range.to, statuses: ["error"], page: 1, pageSize: 50 });
    assert.ok(errors.rows.every((row) => row.status === "error"));

    const byCost = listUsage({ from: range.from, to: range.to, sort: { field: "cost", direction: "desc" }, page: 1, pageSize: 10 });
    for (let index = 1; index < byCost.rows.length; index += 1) {
      assert.ok(byCost.rows[index - 1].costUsd >= byCost.rows[index].costUsd);
    }
  });

  it("returns requested records in the requested order", () => {
    const ids = [ledger.records[10].id, ledger.records[4].id, ledger.records[40].id];
    const records = getRecordsByIds(ids);
    assert.deepEqual(records.map((record) => record.id), ids);
  });

  it("clamps ranges to the ledger bounds", () => {
    const fallback = getDefaultRange();
    // Out-of-bounds values fall back to the default window rather than silently widening the range.
    assert.deepEqual(clampRange({ from: "2019-01-01", to: "2099-01-01" }), fallback);
    // A valid bound is preserved while the invalid one is replaced.
    assert.deepEqual(clampRange({ from: "2019-01-01", to: range.to }), { from: fallback.from, to: range.to });
    assert.deepEqual(clampRange({ from: bounds.from, to: bounds.to }), { from: bounds.from, to: bounds.to });
  });
});

describe("findings and alerts", () => {
  const findings = getFindings();

  it("links every finding to real records", () => {
    assert.ok(findings.length >= 6);
    const ids = new Set(findings.map((finding) => finding.id));
    assert.equal(ids.size, findings.length);
    for (const finding of findings) {
      assert.ok(finding.observed.length >= 3, finding.id);
      assert.ok(finding.relatedRecordIds.length > 0, finding.id);
      const records = getRecordsByIds(finding.relatedRecordIds);
      assert.equal(records.length, finding.relatedRecordIds.length, finding.id);
      if (finding.estimatedImpact) {
        assert.ok(finding.estimatedImpact.monthlyUsd > 0, finding.id);
        assert.ok(finding.estimatedImpact.method.length > 10, finding.id);
      }
    }
  });

  it("resolves a finding by id", () => {
    const target = findings[0];
    assert.equal(getFinding(target.id)?.id, target.id);
    assert.equal(getFinding("find_does_not_exist"), undefined);
  });

  it("keeps alerts aligned with findings", () => {
    const alerts = getAlerts();
    assert.ok(alerts.length > findings.length, "expected extra telemetry alerts");
    const findingIds = new Set(findings.map((finding) => finding.id));
    for (const alert of alerts) {
      if (alert.findingId) assert.ok(findingIds.has(alert.findingId), alert.id);
      assert.ok(["active", "acknowledged", "resolved"].includes(alert.status), alert.id);
    }
    assert.ok(alerts.some((alert) => alert.status === "active"));
    assert.ok(alerts.some((alert) => alert.status === "resolved"));
  });
});
