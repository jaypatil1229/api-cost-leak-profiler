import type { FindingType, Severity } from "./findings";

export type AlertStatus = "active" | "acknowledged" | "resolved";

export type AlertCategory = "cost" | "reliability" | "configuration" | "telemetry";

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  category: AlertCategory;
  findingId: string | null;
  findingType: FindingType | null;
  scopeLabel: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  metric: string;
  relatedRecordIds: string[];
}
