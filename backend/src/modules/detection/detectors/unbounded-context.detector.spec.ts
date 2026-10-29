import { PrismaService } from '../../../database/prisma.service';
import { UnboundedContextDetector } from './unbounded-context.detector';

describe('UnboundedContextDetector', () => {
  const start = new Date('2026-10-29T10:00:00Z');
  const context = { organizationId: 'org-a', projectId: 'project-a', windowStart: start, windowEnd: new Date('2026-10-29T11:00:00Z') };
  const makeRows = (tokens: number[], sessionId: string | null = 'session-positive') => tokens.map((inputTokens, i) => ({ id: `u-${i}`, sessionId, inputTokens, occurredAt: new Date(start.getTime() + i * 1000) }));
  let findMany: jest.Mock;
  let detector: UnboundedContextDetector;

  beforeEach(() => {
    findMany = jest.fn();
    detector = new UnboundedContextDetector({ usageRecord: { findMany } } as unknown as PrismaService);
  });

  it('flags five rows with four monotone increases and reports session evidence', async () => {
    findMany.mockResolvedValue(makeRows([10, 20, 30, 40, 50]));
    const result = await detector.run(context);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ evidence: { sessionId: 'session-positive', callCount: 5, growthRatio: 1, peakInputTokens: 50 } });
    expect(result.findings[0].usageRecordIds).toHaveLength(5);
  });

  it('requires at least five calls and an 80 percent increase ratio', async () => {
    findMany.mockResolvedValue(makeRows([10, 20, 30, 40]));
    expect((await detector.run(context)).findings).toHaveLength(0);
    findMany.mockResolvedValue(makeRows([10, 20, 15, 30, 40])); // 3/4 = exactly 75%
    expect((await detector.run(context)).findings).toHaveLength(0);
  });

  it('ignores null sessions and scopes query to organization, project, and window', async () => {
    findMany.mockResolvedValue(makeRows([10, 20, 30, 40, 50], null));
    expect((await detector.run(context)).findings).toHaveLength(0);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a', projectId: 'project-a', occurredAt: { gte: start, lt: context.windowEnd }, sessionId: { not: null } }) }));
  });
});
