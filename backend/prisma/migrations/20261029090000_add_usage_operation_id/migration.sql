-- Add optional caller-provided operation correlation for retry detection.
ALTER TABLE "UsageRecord" ADD COLUMN "operationId" VARCHAR(128);

CREATE INDEX "UsageRecord_projectId_operationId_occurredAt_idx"
  ON "UsageRecord"("projectId", "operationId", "occurredAt");
