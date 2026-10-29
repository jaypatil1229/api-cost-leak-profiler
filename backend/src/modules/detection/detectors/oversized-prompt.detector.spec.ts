import { PrismaService } from '../../../database/prisma.service';
import { OversizedPromptDetector } from './oversized-prompt.detector';

describe('OversizedPromptDetector', () => {
  const context = { organizationId: 'org-a', projectId: 'project-a', windowStart: new Date('2026-10-29T10:00:00Z'), windowEnd: new Date('2026-10-29T11:00:00Z') };
  let findMany: jest.Mock;
  let detector: OversizedPromptDetector;
  beforeEach(() => { findMany = jest.fn(); detector = new OversizedPromptDetector({ usageRecord: { findMany } } as unknown as PrismaService); });

  it.each([{ inputTokens: 50_000, outputTokens: 0 }, { inputTokens: 0, outputTokens: 16_000 }])('flags exact inclusive token threshold and includes provider evidence', async (counts) => {
    findMany.mockResolvedValue([{ id: 'large-1', ...counts, model: 'gemini-test', featureId: 'large.prompt' }]);
    const result = await detector.run(context);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ evidence: { ...counts, model: 'gemini-test', featureId: 'large.prompt' }, usageRecordIds: [{ id: 'large-1', role: 'primary' }] });
  });

  it('does not query or flag values below both thresholds and keeps tenant scope', async () => {
    findMany.mockResolvedValue([]);
    expect((await detector.run(context)).findings).toHaveLength(0);
    const query = findMany.mock.calls[0][0];
    expect(query.where.organizationId).toBe('org-a');
    expect(query.where.projectId).toBe('project-a');
    expect(query.where.OR).toEqual([{ inputTokens: { gte: 50_000 } }, { outputTokens: { gte: 16_000 } }]);
  });
});
