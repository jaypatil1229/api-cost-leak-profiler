import type { PricingEntry, ProviderId } from "@/types/domain";

export const SAMPLE_TODAY = "2026-09-30";
export const LEDGER_DAYS = 90;

export interface ModelDescriptor {
  id: string;
  name: string;
  providerId: ProviderId;
  providerName: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  contextWindow: number;
  tier: "flagship" | "balanced" | "economy";
}

export const MODELS: readonly ModelDescriptor[] = [
  { id: "gpt-4o", name: "GPT-4o", providerId: "openai", providerName: "OpenAI", inputPerMillionUsd: 2.5, outputPerMillionUsd: 10, contextWindow: 128_000, tier: "balanced" },
  { id: "gpt-4.1", name: "GPT-4.1", providerId: "openai", providerName: "OpenAI", inputPerMillionUsd: 2, outputPerMillionUsd: 8, contextWindow: 1_000_000, tier: "flagship" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", providerId: "openai", providerName: "OpenAI", inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6, contextWindow: 128_000, tier: "economy" },
  { id: "o4-mini", name: "o4-mini", providerId: "openai", providerName: "OpenAI", inputPerMillionUsd: 1.1, outputPerMillionUsd: 4.4, contextWindow: 200_000, tier: "balanced" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "google", providerName: "Google", inputPerMillionUsd: 1.25, outputPerMillionUsd: 10, contextWindow: 1_000_000, tier: "flagship" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google", providerName: "Google", inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4, contextWindow: 1_000_000, tier: "economy" },
] as const;

export const PRICING: readonly PricingEntry[] = MODELS.map((model) => ({
  modelId: model.id,
  modelName: model.name,
  providerId: model.providerId,
  providerName: model.providerName,
  inputPerMillionUsd: model.inputPerMillionUsd,
  outputPerMillionUsd: model.outputPerMillionUsd,
  contextWindow: model.contextWindow,
  isSampleEstimate: true,
}));

export interface FeatureDescriptor {
  id: string;
  name: string;
  description: string;
  owner: string;
  weight: number;
  models: { modelId: string; weight: number }[];
  inputTokens: { min: number; max: number };
  outputTokens: { min: number; max: number };
  failureRate: number;
  retryRate: number;
  duplicateBias: number;
  latencyMs: { min: number; max: number };
}

export const FEATURES: readonly FeatureDescriptor[] = [
  {
    id: "document-summarization",
    name: "Document summarization",
    description: "Summarizes uploaded contracts and long reports for the review workspace.",
    owner: "Review workspace",
    weight: 0.115,
    models: [
      { modelId: "gpt-4o", weight: 0.7 },
      { modelId: "gemini-2.5-pro", weight: 0.3 },
    ],
    inputTokens: { min: 70_000, max: 160_000 },
    outputTokens: { min: 900, max: 1_600 },
    failureRate: 0.012,
    retryRate: 0.05,
    duplicateBias: 0.06,
    latencyMs: { min: 3_200, max: 6_800 },
  },
  {
    id: "code-review",
    name: "Code review assistant",
    description: "Reviews pull requests with repository context attached to every call.",
    owner: "Developer platform",
    weight: 0.085,
    models: [
      { modelId: "gpt-4.1", weight: 0.85 },
      { modelId: "o4-mini", weight: 0.15 },
    ],
    inputTokens: { min: 90_000, max: 260_000 },
    outputTokens: { min: 600, max: 1_400 },
    failureRate: 0.02,
    retryRate: 0.07,
    duplicateBias: 0.04,
    latencyMs: { min: 4_200, max: 9_000 },
  },
  {
    id: "support-reply",
    name: "Support reply drafting",
    description: "Drafts first-pass replies inside the customer support console.",
    owner: "Support operations",
    weight: 0.24,
    models: [{ modelId: "gpt-4o-mini", weight: 1 }],
    inputTokens: { min: 2_200, max: 5_400 },
    outputTokens: { min: 260, max: 520 },
    failureRate: 0.008,
    retryRate: 0.09,
    duplicateBias: 0.07,
    latencyMs: { min: 900, max: 2_400 },
  },
  {
    id: "search-rerank",
    name: "Search relevance reranking",
    description: "Reranks internal knowledge search results before they reach the user.",
    owner: "Search",
    weight: 0.215,
    models: [{ modelId: "gemini-2.0-flash", weight: 1 }],
    inputTokens: { min: 2_200, max: 3_600 },
    outputTokens: { min: 18, max: 64 },
    failureRate: 0.004,
    retryRate: 0.02,
    duplicateBias: 0.01,
    latencyMs: { min: 320, max: 900 },
  },
  {
    id: "invoice-extraction",
    name: "Invoice extraction",
    description: "Extracts line items from supplier invoices in the finance pipeline.",
    owner: "Finance tools",
    weight: 0.115,
    models: [
      { modelId: "gemini-2.0-flash", weight: 0.75 },
      { modelId: "gpt-4o-mini", weight: 0.25 },
    ],
    inputTokens: { min: 4_000, max: 7_000 },
    outputTokens: { min: 180, max: 420 },
    failureRate: 0.03,
    retryRate: 0.06,
    duplicateBias: 0.03,
    latencyMs: { min: 1_200, max: 2_800 },
  },
  {
    id: "onboarding-copilot",
    name: "Onboarding copilot",
    description: "Answers activation questions for new accounts inside the product.",
    owner: "Growth",
    weight: 0.07,
    models: [
      { modelId: "gpt-4.1", weight: 0.6 },
      { modelId: "gpt-4o", weight: 0.4 },
    ],
    inputTokens: { min: 5_000, max: 11_000 },
    outputTokens: { min: 520, max: 1_100 },
    failureRate: 0.02,
    retryRate: 0.05,
    duplicateBias: 0.04,
    latencyMs: { min: 1_800, max: 4_200 },
  },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "Turns call transcripts into structured notes and action items.",
    owner: "Customer success",
    weight: 0.075,
    models: [
      { modelId: "gpt-4o", weight: 0.6 },
      { modelId: "gemini-2.5-pro", weight: 0.4 },
    ],
    inputTokens: { min: 35_000, max: 95_000 },
    outputTokens: { min: 900, max: 1_900 },
    failureRate: 0.015,
    retryRate: 0.04,
    duplicateBias: 0.02,
    latencyMs: { min: 3_800, max: 7_600 },
  },
  {
    id: "marketing-copy",
    name: "Marketing copy drafting",
    description: "Drafts campaign variants for the lifecycle marketing team.",
    owner: "Marketing",
    weight: 0.085,
    models: [{ modelId: "gpt-4o", weight: 1 }],
    inputTokens: { min: 2_000, max: 4_000 },
    outputTokens: { min: 640, max: 1_300 },
    failureRate: 0.006,
    retryRate: 0.05,
    duplicateBias: 0.08,
    latencyMs: { min: 1_400, max: 3_200 },
  },
] as const;

export interface UserDescriptor {
  id: string;
  name: string;
  email: string;
  team: string;
  initials: string;
}

export const USERS: readonly UserDescriptor[] = [
  { id: "usr_ay", name: "Asha Yadav", email: "asha@northwind.example", team: "Platform", initials: "AY" },
  { id: "usr_mo", name: "Marcus Oyelaran", email: "marcus@northwind.example", team: "Platform", initials: "MO" },
  { id: "usr_rk", name: "Rina Kapoor", email: "rina@northwind.example", team: "Support", initials: "RK" },
  { id: "usr_dl", name: "Daniel Lauterbach", email: "daniel@northwind.example", team: "Support", initials: "DL" },
  { id: "usr_es", name: "Elena Sartori", email: "elena@northwind.example", team: "Finance tools", initials: "ES" },
  { id: "usr_jb", name: "Jonah Bright", email: "jonah@northwind.example", team: "Growth", initials: "JB" },
  { id: "usr_pn", name: "Priya Nandakumar", email: "priya@northwind.example", team: "Data", initials: "PN" },
  { id: "usr_tv", name: "Tomas Vidal", email: "tomas@northwind.example", team: "Developer platform", initials: "TV" },
  { id: "usr_sk", name: "Sofia Karlsson", email: "sofia@northwind.example", team: "Customer success", initials: "SK" },
  { id: "usr_bm", name: "Bilal Mansour", email: "bilal@northwind.example", team: "Marketing", initials: "BM" },
  { id: "usr_hc", name: "Hannah Cho", email: "hannah@northwind.example", team: "Review workspace", initials: "HC" },
  { id: "usr_ao", name: "Owen Adeyemi", email: "owen@northwind.example", team: "Developer platform", initials: "AO" },
] as const;

export interface ProjectDescriptor {
  id: string;
  name: string;
  weight: number;
}

export const PROJECT_TRAFFIC: readonly ProjectDescriptor[] = [
  { id: "proj_customer-platform", name: "Customer platform", weight: 0.93 },
  { id: "proj_internal-tools", name: "Internal tools", weight: 0.07 },
] as const;

export function modelById(modelId: string): ModelDescriptor {
  const model = MODELS.find((entry) => entry.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return model;
}

export function featureById(featureId: string): FeatureDescriptor {
  const feature = FEATURES.find((entry) => entry.id === featureId);
  if (!feature) throw new Error(`Unknown feature: ${featureId}`);
  return feature;
}

export function costOf(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = modelById(modelId);
  const cost = (inputTokens / 1_000_000) * model.inputPerMillionUsd + (outputTokens / 1_000_000) * model.outputPerMillionUsd;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
