export const APP_NAME = "ACLP";
export const APP_LONG_NAME = "API Cost Leak Profiler";
export const APP_TAGLINE = "Make every AI dollar make sense.";
export const APP_PROMISE = "See where your AI spend goes. Understand why. Know what to fix.";

export const MARKETING_NAV = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/docs", label: "Documentation" },
] as const;

export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Product overview" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/sign-up", label: "Get started" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs#telemetry", label: "Telemetry model" },
      { href: "/docs#providers", label: "Supported providers" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export interface NavItem {
  href: string;
  label: string;
  icon: "overview" | "attribution" | "trends" | "usage" | "findings" | "alerts" | "reports" | "project" | "organization";
  badge?: "alerts";
}

export const DASHBOARD_NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ href: "/overview", label: "Overview", icon: "overview" }] },
  {
    section: "Analytics",
    items: [
      { href: "/attribution", label: "Cost & attribution", icon: "attribution" },
      { href: "/trends", label: "Trends", icon: "trends" },
      { href: "/usage", label: "Usage explorer", icon: "usage" },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { href: "/findings", label: "Leak detection", icon: "findings" },
      { href: "/alerts", label: "Alerts", icon: "alerts", badge: "alerts" },
      { href: "/reports", label: "Reports", icon: "reports" },
    ],
  },
  {
    section: "Settings",
    items: [
      { href: "/project-settings", label: "Project settings", icon: "project" },
      { href: "/organization-settings", label: "Organization settings", icon: "organization" },
    ],
  },
];

export interface DatePreset {
  value: string;
  label: string;
  days: number;
  granularity: "day" | "week";
}

export const DATE_PRESETS: DatePreset[] = [
  { value: "7d", label: "Last 7 days", days: 7, granularity: "day" },
  { value: "30d", label: "Last 30 days", days: 30, granularity: "day" },
  { value: "90d", label: "Last 90 days", days: 90, granularity: "week" },
];

export const STORAGE_KEYS = {
  alerts: "aclp.alerts.v1",
  projectSettings: "aclp.project-settings.v1",
  projectId: "aclp.project.v1",
  sidebar: "aclp.sidebar.v1",
  onboarding: "aclp.onboarding.v1",
} as const;

export const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const FINDING_TYPE_LABELS = {
  "duplicate-prompts": "Duplicate prompts",
  "retry-loops": "Retry loops",
  "context-growth": "Context growth",
  "oversized-prompts": "Oversized prompts",
  "spend-spike": "Spend spike",
  "unusual-token-consumption": "Unusual token use",
  "unexpected-model-usage": "Unexpected model use",
  "inefficient-workflow": "Inefficient workflow",
} as const;

export const SAMPLE_DATA_NOTICE = "Sample data — every number in this prototype is generated locally and is not real customer telemetry.";
