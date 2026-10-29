import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export const SPEND_SPIKE_RUN_TTL_MS = 24 * 60 * 60 * 1000;
const STORE_VERSION = 1;

export function defaultSpendSpikeRunStorePath(env = process.env) {
  const userData = env.LOCALAPPDATA || homedir();
  return join(userData, "ACLP", "sdk-test-app", "spend-spike-runs.json");
}

/** Local, restart-safe state for the two-stage Spend Spike test-app scenario. */
export class SpendSpikeRunStore {
  constructor({ filePath = defaultSpendSpikeRunStorePath(), now = Date.now } = {}) {
    this.filePath = resolve(filePath);
    this.now = now;
    this.runs = new Map();
    this.load();
  }

  get(scenarioRunId) {
    const run = this.runs.get(scenarioRunId);
    if (!run) return null;
    if (run.expiresAt <= this.now()) {
      this.runs.delete(scenarioRunId);
      this.persist();
      return null;
    }
    return { ...run };
  }

  listActive() {
    const now = this.now();
    let removedExpired = false;
    for (const [id, run] of this.runs) {
      if (run.expiresAt <= now) {
        this.runs.delete(id);
        removedExpired = true;
      }
    }
    if (removedExpired) this.persist();
    return [...this.runs.values()]
      .filter((run) => run.status === "baseline_ready")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((run) => ({ ...run }));
  }

  put(run) {
    const normalized = normalizeRun(run);
    this.runs.set(normalized.scenarioRunId, normalized);
    this.persist();
    return { ...normalized };
  }

  update(scenarioRunId, patch) {
    const current = this.get(scenarioRunId);
    if (!current) return null;
    return this.put({ ...current, ...patch, scenarioRunId });
  }

  load() {
    if (!existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (data.version !== STORE_VERSION || !Array.isArray(data.runs)) {
        throw new Error("Unsupported Spend Spike state format.");
      }
      for (const candidate of data.runs) {
        const run = normalizeRun(candidate);
        if (run.expiresAt <= this.now()) continue;
        // A server restart during the paid burst must not replay provider calls.
        if (run.status === "running") run.status = "interrupted";
        this.runs.set(run.scenarioRunId, run);
      }
      if ([...this.runs.values()].some((run) => run.status === "interrupted")) this.persist();
    } catch {
      // Leave a corrupt file untouched; the client receives the actionable
      // missing-run response and can start a new baseline explicitly.
      this.runs.clear();
    }
  }

  persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${this.now()}.tmp`;
    writeFileSync(
      tempPath,
      JSON.stringify({ version: STORE_VERSION, runs: [...this.runs.values()] }),
      { encoding: "utf8", mode: 0o600 },
    );
    renameSync(tempPath, this.filePath);
  }
}

function normalizeRun(run) {
  if (
    !run ||
    typeof run.scenarioRunId !== "string" ||
    typeof run.status !== "string" ||
    typeof run.baselineEventId !== "string" ||
    !Number.isFinite(run.readyAt) ||
    !Number.isFinite(run.createdAt) ||
    !Number.isFinite(run.expiresAt) ||
    typeof run.feature !== "string" ||
    typeof run.sessionId !== "string"
  ) {
    throw new Error("Invalid Spend Spike run state.");
  }
  return {
    scenarioRunId: run.scenarioRunId,
    status: run.status,
    baselineEventId: run.baselineEventId,
    readyAt: run.readyAt,
    createdAt: run.createdAt,
    expiresAt: run.expiresAt,
    feature: run.feature,
    sessionId: run.sessionId,
  };
}
