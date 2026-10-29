export type AlertSortBy = "updatedAt" | "createdAt" | "severity";
export type AlertStatusFilter = "" | "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
export type AlertSeverityFilter = "" | "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AlertListFilters {
  page: number;
  status: AlertStatusFilter;
  severity: AlertSeverityFilter;
  sortBy: AlertSortBy;
}

export const DEFAULT_ALERT_LIST_FILTERS: AlertListFilters = {
  page: 1,
  status: "",
  severity: "",
  sortBy: "updatedAt",
};

export function parseAlertListFilters(search: string): AlertListFilters {
  const params = new URLSearchParams(search);
  const status = params.get("status") ?? "";
  const severity = params.get("severity") ?? "";
  const sortBy = params.get("sort") ?? "updatedAt";
  const page = Number(params.get("page") ?? 1);
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    status: ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"].includes(status)
      ? status as AlertStatusFilter
      : "",
    severity: ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)
      ? severity as AlertSeverityFilter
      : "",
    sortBy: ["updatedAt", "createdAt", "severity"].includes(sortBy)
      ? sortBy as AlertSortBy
      : "updatedAt",
  };
}

export function serializeAlertListFilters(search: string, filters: AlertListFilters): string {
  const params = new URLSearchParams(search);
  if (filters.page > 1) params.set("page", String(filters.page));
  else params.delete("page");
  if (filters.status) params.set("status", filters.status);
  else params.delete("status");
  if (filters.severity) params.set("severity", filters.severity);
  else params.delete("severity");
  if (filters.sortBy !== "updatedAt") params.set("sort", filters.sortBy);
  else params.delete("sort");
  const query = params.toString();
  return query ? `?${query}` : "";
}
