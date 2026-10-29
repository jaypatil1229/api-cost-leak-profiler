import assert from "node:assert/strict";
import test from "node:test";

import { FINDINGS_CREATED_DESCRIPTION, getDetectorScannedDescription } from "./run-metrics";

test("scanned metric semantics describe each deterministic detector contract", () => {
  const descriptions = {
    DUPLICATE_PROMPT: getDetectorScannedDescription("DUPLICATE_PROMPT"),
    RETRY_LOOP: getDetectorScannedDescription("RETRY_LOOP"),
    UNBOUNDED_CONTEXT: getDetectorScannedDescription("UNBOUNDED_CONTEXT"),
    OVERSIZED_PROMPT: getDetectorScannedDescription("OVERSIZED_PROMPT"),
    SPEND_SPIKE: getDetectorScannedDescription("SPEND_SPIKE"),
  };
  assert.match(descriptions.DUPLICATE_PROMPT, /non-null prompt hash/);
  assert.match(descriptions.RETRY_LOOP, /Unique usage events/);
  assert.match(descriptions.RETRY_LOOP, /5 attempts/);
  assert.match(descriptions.UNBOUNDED_CONTEXT, /session ID/);
  assert.match(descriptions.UNBOUNDED_CONTEXT, /80%/);
  assert.match(descriptions.OVERSIZED_PROMPT, /50,000/);
  assert.match(descriptions.OVERSIZED_PROMPT, /16,000/);
  assert.match(descriptions.SPEND_SPIKE, /both preceding equal-length windows/);
  assert.match(descriptions.SPEND_SPIKE, /two-windows-ago fallback/);
});

test("finding metric is explicitly new persisted rows rather than matches or alerts", () => {
  assert.match(FINDINGS_CREATED_DESCRIPTION, /New finding rows inserted/);
  assert.match(FINDINGS_CREATED_DESCRIPTION, /existing finding/);
  assert.match(FINDINGS_CREATED_DESCRIPTION, /alert deduplication is a separate step/);
});
