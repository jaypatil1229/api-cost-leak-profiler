-- One alert is associated with at most one persisted finding. Multiple
-- organization-level alerts with NULL findingId remain valid in PostgreSQL.
-- Abort rather than delete or merge existing user data if duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT "findingId"
    FROM "Alert"
    WHERE "findingId" IS NOT NULL
    GROUP BY "findingId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate alerts reference the same finding. Reconcile alert lifecycle states before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Alert_findingId_key" ON "Alert"("findingId");
DROP INDEX "Alert_findingId_idx";
