const detectorScannedDescriptions: Record<string, string> = {
  DUPLICATE_PROMPT:
    "Usage records in this organization, project, and half-open time window that have a non-null prompt hash. One finding represents each prompt-hash group with more than one record.",
  RETRY_LOOP:
    "Unique usage events in the window returned with a non-null operation ID, deduplicated by event ID (or record ID when absent). Findings require a qualifying operation sequence of at least 5 attempts, at least 2 failures, and no adjacent gap over 2 seconds.",
  UNBOUNDED_CONTEXT:
    "Usage records in the window with a session ID. A finding represents a session with at least 5 calls and input-token growth on at least 80% of adjacent pairs.",
  OVERSIZED_PROMPT:
    "Usage records in the window with input tokens at least 50,000 or output tokens at least 16,000. Each qualifying call can produce one finding.",
  SPEND_SPIKE:
    "Cost-valued usage records across the current window and both preceding equal-length windows. The baseline uses the immediate previous window, or the two-windows-ago fallback when the immediate previous window has zero cost.",
};

export function getDetectorScannedDescription(detectorType: string): string {
  return detectorScannedDescriptions[detectorType] ??
    "The number of records or inputs examined under this detector's own query and analysis contract for the saved run window.";
}

export const FINDINGS_CREATED_DESCRIPTION =
  "New finding rows inserted by this run. Results matching an existing finding are refreshed and are not counted as newly created. One finding may link several usage records, and alert deduplication is a separate step.";

export const FINDINGS_MATCHED_DESCRIPTION =
  "Detector results matched an existing finding by its stable issue identity. The finding and its evidence links were refreshed without changing its lifecycle status.";

export const ALERT_ACTIONS_DESCRIPTION =
  "Alerts created counts new alert rows. Alerts updated counts existing open or acknowledged alerts whose linked finding or visible evidence changed. Unchanged deduplicated alerts do not increment either count.";
