-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "issueKey" VARCHAR(128);

-- AlterTable
ALTER TABLE "DetectionFinding" ADD COLUMN     "issueKey" VARCHAR(128);

-- CreateIndex
CREATE INDEX "Alert_projectId_category_issueKey_idx" ON "Alert"("projectId", "category", "issueKey");
