import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SpendSpikeRunStore } from "../spend-spike-run-store.js";

function fixtureRun(overrides = {}) {
  return {
    scenarioRunId: "run-1",
    status: "baseline_ready",
    baselineEventId: "sdkdemo-baseline-1",
    readyAt: 2_000,
    createdAt: 1_000,
    expiresAt: 86_401_000,
    feature: "career.chatbot",
    sessionId: "session-1",
    ...overrides,
  };
}

describe("Spend Spike durable run state", () => {
  it("restores a baseline run from a new store instance without retaining prompt text", () => {
    const directory = mkdtempSync(join(tmpdir(), "aclp-spend-run-"));
    const filePath = join(directory, "runs.json");
    try {
      const beforeRestart = new SpendSpikeRunStore({ filePath, now: () => 1_500 });
      beforeRestart.put(fixtureRun());

      const afterRestart = new SpendSpikeRunStore({ filePath, now: () => 1_600 });

      assert.deepEqual(afterRestart.get("run-1"), fixtureRun());
      assert.deepEqual(afterRestart.listActive(), [fixtureRun()]);
      assert.equal(readFileSync(filePath, "utf8").includes('"text"'), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("marks an interrupted burst as non-resumable after restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "aclp-spend-run-"));
    const filePath = join(directory, "runs.json");
    try {
      new SpendSpikeRunStore({ filePath, now: () => 1_500 }).put(
        fixtureRun({ status: "running" }),
      );

      const afterRestart = new SpendSpikeRunStore({ filePath, now: () => 1_600 });

      assert.equal(afterRestart.get("run-1")?.status, "interrupted");
      assert.deepEqual(afterRestart.listActive(), []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("expires stale runs instead of replaying a burst", () => {
    const directory = mkdtempSync(join(tmpdir(), "aclp-spend-run-"));
    const filePath = join(directory, "runs.json");
    let now = 1_500;
    try {
      const store = new SpendSpikeRunStore({ filePath, now: () => now });
      store.put(fixtureRun({ expiresAt: 1_600 }));
      now = 1_601;

      assert.equal(store.get("run-1"), null);
      assert.deepEqual(store.listActive(), []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
