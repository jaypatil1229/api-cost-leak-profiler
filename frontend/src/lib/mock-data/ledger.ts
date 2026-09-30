import { addDays, format } from "date-fns";
import type { EnvironmentId, RequestStatus, UsageRecord } from "@/types/domain";
import { FEATURES, LEDGER_DAYS, MODELS, PROJECT_TRAFFIC, SAMPLE_TODAY, USERS, costOf, featureById, modelById, type FeatureDescriptor } from "./catalog";

export interface Ledger {
  records: readonly UsageRecord[];
  startDate: string;
  endDate: string;
}

const DAILY_BASE = 560;
const USER_WEIGHTS = [1.6, 1.4, 1.05, 0.95, 0.7, 0.85, 1.35, 1.15, 0.9, 1.25, 0.8, 1.0];
const TEMPLATE_COUNT = 8;

interface ScenarioWindow {
  from: number;
  to: number;
}

const SCENARIOS: Record<string, ScenarioWindow> = {
  spike: { from: 78, to: 82 },
  contextGrowth: { from: 72, to: 82 },
  retryLoop: { from: 76, to: 84 },
  duplicateBurst: { from: 66, to: 79 },
  oversizedContext: { from: 63, to: 89 },
  modelEscalation: { from: 79, to: 86 },
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(entries: readonly T[], random: () => number): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = random() * total;
  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function skewedInt(min: number, max: number, random: () => number): number {
  return Math.round(min + (max - min) * Math.pow(random(), 1.55));
}

function intBetween(min: number, max: number, random: () => number): number {
  return Math.round(min + (max - min) * random());
}

function inWindow(window: ScenarioWindow, dayIndex: number): boolean {
  return dayIndex >= window.from && dayIndex <= window.to;
}

function resolveModelId(feature: FeatureDescriptor, dayIndex: number, random: () => number): string {
  if (feature.id === "invoice-extraction" && inWindow(SCENARIOS.modelEscalation, dayIndex) && random() < 0.72) {
    return "gpt-4o";
  }
  return pickWeighted(feature.models, random).modelId;
}

function resolveInputTokens(feature: FeatureDescriptor, dayIndex: number, random: () => number, modelId: string): number {
  const base = skewedInt(feature.inputTokens.min, feature.inputTokens.max, random);
  if (feature.id === "document-summarization" && inWindow(SCENARIOS.contextGrowth, dayIndex)) {
    const ramp = 1.6 + random() * 0.8;
    return Math.min(Math.round(base * ramp), 268_000);
  }
  if (feature.id === "code-review" && inWindow(SCENARIOS.oversizedContext, dayIndex)) {
    return Math.min(Math.round(base * (1.22 + random() * 0.3)), 320_000);
  }
  const model = modelById(modelId);
  return Math.min(base, Math.round(model.contextWindow * 0.92));
}

function resolveRetryProbability(feature: FeatureDescriptor, dayIndex: number): number {
  if (feature.id === "support-reply" && inWindow(SCENARIOS.retryLoop, dayIndex)) return 0.31;
  return feature.retryRate;
}

function resolveTemplateCount(feature: FeatureDescriptor, dayIndex: number): number {
  if (feature.id === "marketing-copy" && inWindow(SCENARIOS.duplicateBurst, dayIndex)) return 2;
  if (feature.id === "support-reply" && inWindow(SCENARIOS.retryLoop, dayIndex)) return 3;
  return TEMPLATE_COUNT;
}

export function buildLedger(): Ledger {
  const random = mulberry32(20_260_930);
  const endDate = new Date(`${SAMPLE_TODAY}T00:00:00`);
  const startDate = addDays(endDate, -(LEDGER_DAYS - 1));
  const records: UsageRecord[] = [];
  let counter = 0;

  const nextId = () => `req_${String(++counter).padStart(6, "0")}`;

  for (let dayIndex = 0; dayIndex < LEDGER_DAYS; dayIndex += 1) {
    const date = addDays(startDate, dayIndex);
    const weekday = date.getDay();
    const weekdayFactor = weekday === 0 ? 0.62 : weekday === 6 ? 0.68 : 1.06;
    const trend = 0.85 + 0.3 * (dayIndex / (LEDGER_DAYS - 1));
    const jitter = 0.92 + random() * 0.16;
    const count = Math.max(120, Math.round(DAILY_BASE * weekdayFactor * trend * jitter));

    for (let index = 0; index < count; index += 1) {
      const feature = pickWeighted(FEATURES, random);
      const modelId = resolveModelId(feature, dayIndex, random);
      const model = modelById(modelId);
      const inputTokens = resolveInputTokens(feature, dayIndex, random, modelId);
      const outputTokens = intBetween(feature.outputTokens.min, feature.outputTokens.max, random);
      const failureRate = feature.failureRate;
      const retryRate = resolveRetryProbability(feature, dayIndex);
      const roll = random();
      const status: RequestStatus = roll < failureRate ? "error" : roll < failureRate + retryRate ? "retried" : "ok";

      const userIndex = (() => {
        const picked = pickWeighted(
          USERS.map((user, position) => ({ ...user, weight: USER_WEIGHTS[position] ?? 1 })),
          random,
        );
        return USERS.findIndex((user) => user.id === picked.id);
      })();
      const user = USERS[userIndex];
      const userKey = user.id.replace("usr_", "");
      const templateCount = resolveTemplateCount(feature, dayIndex);
      const templateIndex = Math.floor(random() * templateCount);
      const project = pickWeighted(PROJECT_TRAFFIC, random);
      const environmentId: EnvironmentId = random() < 0.88 ? "production" : "staging";
      const hour = Math.floor(((random() + random()) / 2) * 13) + 8;
      const minute = Math.floor(random() * 60);
      const second = Math.floor(random() * 60);
      const timestamp = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, second);
      const sessionIndex = Math.floor(random() * 3);

      const base: UsageRecord = {
        id: nextId(),
        timestamp: timestamp.toISOString(),
        featureId: feature.id,
        featureName: feature.name,
        userId: user.id,
        userName: user.name,
        modelId: model.id,
        modelName: model.name,
        providerId: model.providerId,
        providerName: model.providerName,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: costOf(modelId, inputTokens, outputTokens),
        latencyMs: Math.round(intBetween(feature.latencyMs.min, feature.latencyMs.max, random) * (status === "error" ? 0.35 : 1)),
        status,
        sessionId: `ses_${userKey}_${dayIndex}_${sessionIndex}`,
        environmentId,
        projectId: project.id,
        promptFingerprint: `fp_${feature.id}_${userKey}_${templateIndex}`,
        contextUtilization: Math.round((inputTokens / model.contextWindow) * 10_000) / 10_000,
      };

      records.push(base);

      if (status !== "ok" && random() < 0.82) {
        const retryInput = Math.round(inputTokens * (1.02 + random() * 0.12));
        const retryOutput = Math.round(outputTokens * (0.9 + random() * 0.25));
        records.push({
          ...base,
          id: nextId(),
          timestamp: new Date(timestamp.getTime() + intBetween(4_000, 48_000, random)).toISOString(),
          inputTokens: retryInput,
          outputTokens: retryOutput,
          totalTokens: retryInput + retryOutput,
          costUsd: costOf(modelId, retryInput, retryOutput),
          status: "ok",
          latencyMs: Math.round(intBetween(feature.latencyMs.min, feature.latencyMs.max, random)),
          retryOf: base.id,
          contextUtilization: Math.round((retryInput / model.contextWindow) * 10_000) / 10_000,
        });
      }
    }
  }

  records.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));

  return {
    records,
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  };
}

let cachedLedger: Ledger | null = null;

export function getLedger(): Ledger {
  if (!cachedLedger) cachedLedger = buildLedger();
  return cachedLedger;
}

export function describeScenarioWindow(name: keyof typeof SCENARIOS, ledger: Ledger): { from: string; to: string } {
  const window = SCENARIOS[name];
  const start = new Date(`${ledger.startDate}T00:00:00`);
  return {
    from: format(addDays(start, window.from), "yyyy-MM-dd"),
    to: format(addDays(start, window.to), "yyyy-MM-dd"),
  };
}

export { FEATURES, MODELS, USERS, featureById, modelById };
