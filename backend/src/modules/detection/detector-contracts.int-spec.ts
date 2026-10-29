jest.mock('../../config/config.module', () => ({ APP_CONFIG: 'APP_CONFIG' }));

import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma, DetectorType } from '@prisma/client';
import { DetectionService } from './detection.service';
import { AlertsService } from './alerts.service';
import { DetectorRegistry } from './detectors/detector.registry';
import { DuplicatePromptDetector } from './detectors/duplicate-prompt.detector';
import { RetryLoopDetector } from './detectors/retry-loop.detector';
import { UnboundedContextDetector } from './detectors/unbounded-context.detector';
import { OversizedPromptDetector } from './detectors/oversized-prompt.detector';
import { SpendSpikeDetector } from './detectors/spend-spike.detector';
import { PrismaService } from '../../database/prisma.service';
import type { Configuration } from '../../config/configuration';

const prisma = new PrismaClient();
const guarded = process.env.RUN_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

guarded('PostgreSQL detector contract persistence', () => {
  let userId: string;
  let organizationId: string;
  let projectId: string;
  const detectorTypes = [DetectorType.DUPLICATE_PROMPT, DetectorType.RETRY_LOOP, DetectorType.UNBOUNDED_CONTEXT, DetectorType.OVERSIZED_PROMPT, DetectorType.SPEND_SPIKE];
  const pricingVersion = `detector-contract-${randomUUID()}`;
  const start = new Date('2026-10-29T10:00:00.000Z');
  const end = new Date('2026-10-29T11:00:00.000Z');
  const config = { limits: { defaultPageSize: 25, maxPageSize: 100 } } as Configuration;
  let detection: DetectionService;

  beforeAll(async () => {
    const identity = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (identity[0]?.database !== 'aclp_test') throw new Error('Detector integration tests require aclp_test.');
    const user = await prisma.user.create({ data: { email: `detector-contract-${randomUUID()}@example.test`, name: 'Detector contract test', passwordHash: 'not-used' } });
    userId = user.id;
    const org = await prisma.organization.create({ data: { name: 'Detector contract test', slug: `dct-${randomUUID()}`, ownerUserId: userId } });
    organizationId = org.id;
    const project = await prisma.project.create({ data: { organizationId, name: 'Detector contract test', slug: `dctp-${randomUUID()}` } });
    projectId = project.id;

    await prisma.modelPricing.create({ data: { provider: 'OPENAI', model: 'detector-spend-fixture', version: pricingVersion, inputRatePerMillionTokens: new Prisma.Decimal('1'), outputRatePerMillionTokens: new Prisma.Decimal('1'), currency: 'USD', effectiveFrom: new Date('2020-01-01T00:00:00.000Z') } });

    const registry = new DetectorRegistry();
    const db = prisma as unknown as PrismaService;
    registry.register(new DuplicatePromptDetector(db));
    registry.register(new RetryLoopDetector(db));
    registry.register(new UnboundedContextDetector(db));
    registry.register(new OversizedPromptDetector(db));
    registry.register(new SpendSpikeDetector(db));
    detection = new DetectionService(db, registry, config, new AlertsService(db, config));
  });

  afterAll(async () => {
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.modelPricing.deleteMany({ where: { provider: 'OPENAI', model: 'detector-spend-fixture', version: pricingVersion } });
    await prisma.$disconnect();
  });

  async function addEvent(input: { id?: string; at: Date; promptHash?: string | null; operationId?: string | null; sessionId?: string | null; inputTokens?: number; outputTokens?: number; status?: 'SUCCESS'|'ERROR'|'TIMEOUT'|'RATE_LIMITED'; cost?: string }) {
    const inputTokens = input.inputTokens ?? 1; const outputTokens = input.outputTokens ?? 1;
    return prisma.usageRecord.create({ data: { organizationId, projectId, eventId: input.id ?? randomUUID(), provider: 'OPENAI', model: input.cost ? 'detector-spend-fixture' : 'detector-fixture', occurredAt: input.at, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, promptHash: input.promptHash ?? null, operationId: input.operationId ?? null, sessionId: input.sessionId ?? null, status: input.status ?? 'SUCCESS', estimatedInputCost: input.cost ? new Prisma.Decimal(input.cost).div(2) : null, estimatedOutputCost: input.cost ? new Prisma.Decimal(input.cost).div(2) : null, estimatedTotalCost: input.cost ? new Prisma.Decimal(input.cost) : null, costStatus: input.cost ? 'CALCULATED' : 'PENDING_PRICING' } });
  }

  async function run(type: (typeof detectorTypes)[number], windowStart = start, windowEnd = end) {
    const run = await detection.triggerRun(organizationId, { detectorType: type, projectId, windowStart, windowEnd }, userId);
    for (let i = 0; i < 200; i++) {
      const state = await prisma.detectionRun.findUniqueOrThrow({ where: { id: run.id }, select: { status: true, error: true } });
      if (state.status === 'COMPLETED') return run.id;
      if (state.status === 'FAILED') throw new Error(`Detection failed: ${state.error}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Detection run timeout');
  }

  async function findings(type: (typeof detectorTypes)[number], title?: string) {
    return prisma.detectionFinding.findMany({ where: { organizationId, projectId, detectorType: type, ...(title ? { title: { contains: title } } : {}) }, include: { usageLinks: { include: { usageRecord: true } }, alerts: true } as any });
  }

  it('persists duplicate prompt finding and linked evidence; distinct hashes are negative control', async () => {
    const hash = randomUUID(); const a = await addEvent({ at: new Date(start.getTime()+1000), promptHash: hash }); const b = await addEvent({ at: new Date(start.getTime()+2000), promptHash: hash });
    const uniqueHash = randomUUID(); await addEvent({ at: new Date(start.getTime()+3000), promptHash: uniqueHash });
    await run(DetectorType.DUPLICATE_PROMPT);
    const rows = await findings(DetectorType.DUPLICATE_PROMPT, 'Duplicate prompt detected');
    const row = rows.find((x: any) => (x.evidence as any).promptHash === hash);
    expect(row).toBeDefined(); expect((row!.evidence as any).duplicateCount).toBe(2);
    expect((row as any).usageLinks.map((x: any) => x.usageRecordId).sort()).toEqual([a.id,b.id].sort());
    expect((row as any).alerts).not.toBeNull();
  });

  it('persists qualifying retry loop and rejects insufficient failures, attempts, or timing', async () => {
    const op = `retry-${randomUUID()}`; const good=[];
    for (const [i,status] of (['ERROR','TIMEOUT','ERROR','SUCCESS','SUCCESS'] as const).entries()) good.push(await addEvent({ at:new Date(start.getTime()+i*300), operationId:op, status }));
    const insufficient=`fewfail-${randomUUID()}`; for(const [i,status] of (['ERROR','SUCCESS','SUCCESS','SUCCESS','SUCCESS'] as const).entries()) await addEvent({at:new Date(start.getTime()+3000+i*200),operationId:insufficient,status});
    const few=`few-${randomUUID()}`; for(const [i,status] of (['ERROR','TIMEOUT','SUCCESS','SUCCESS'] as const).entries()) await addEvent({at:new Date(start.getTime()+5000+i*200),operationId:few,status});
    const gap=`gap-${randomUUID()}`; for(const [i,status] of (['ERROR','TIMEOUT','ERROR','SUCCESS','SUCCESS'] as const).entries()) await addEvent({at:new Date(start.getTime()+7000+i*2100),operationId:gap,status});
    await run(DetectorType.RETRY_LOOP);
    const rows=await findings(DetectorType.RETRY_LOOP); const row=rows.find((x:any)=>(x.evidence as any).operationId===op);
    expect(row).toBeDefined(); expect(row!.evidence).toMatchObject({operationId:op,attemptCount:5,failedAttemptCount:3});
    expect((row as any).usageLinks.map((x:any)=>x.usageRecordId).sort()).toEqual(good.map(x=>x.id).sort()); expect((row as any).alerts).not.toBeNull();
    expect(rows.some((x:any)=>[insufficient,few,gap].includes((x.evidence as any).operationId))).toBe(false);
  });

  it('persists unbounded-context evidence only for qualifying scoped token progression', async () => {
    const session=`growth-${randomUUID()}`; const good=[]; for(const [i,n] of [10,20,30,40,50].entries())good.push(await addEvent({at:new Date(start.getTime()+i*1000),sessionId:session,inputTokens:n}));
    const negative=`flat-${randomUUID()}`; for(const [i,n] of [10,20,15,30,40].entries())await addEvent({at:new Date(start.getTime()+10000+i*1000),sessionId:negative,inputTokens:n});
    await run(DetectorType.UNBOUNDED_CONTEXT); const rows=await findings(DetectorType.UNBOUNDED_CONTEXT); const row=rows.find((x:any)=>(x.evidence as any).sessionId===session);
    expect(row).toBeDefined(); expect(row!.evidence).toMatchObject({sessionId:session,callCount:5,growthRatio:1,peakInputTokens:50}); expect((row as any).usageLinks.map((x:any)=>x.usageRecordId).sort()).toEqual(good.map(x=>x.id).sort()); expect((row as any).alerts).not.toBeNull(); expect(rows.some((x:any)=>(x.evidence as any).sessionId===negative)).toBe(false);
  });

  it('persists oversized input/output boundary findings and excludes below-boundary controls', async () => {
    const inBoundary=await addEvent({at:new Date(start.getTime()+1000),inputTokens:50000,outputTokens:0}); await addEvent({at:new Date(start.getTime()+2000),inputTokens:49999,outputTokens:0});
    const outBoundary=await addEvent({at:new Date(start.getTime()+3000),inputTokens:0,outputTokens:16000}); await addEvent({at:new Date(start.getTime()+4000),inputTokens:0,outputTokens:15999});
    await run(DetectorType.OVERSIZED_PROMPT); const rows=await findings(DetectorType.OVERSIZED_PROMPT); const linked=rows.flatMap((x:any)=>x.usageLinks.map((l:any)=>l.usageRecordId));
    expect(linked).toEqual(expect.arrayContaining([inBoundary.id,outBoundary.id])); expect(linked).not.toContain((await prisma.usageRecord.findFirstOrThrow({where:{projectId,inputTokens:49999}})).id); expect(rows.every((x:any)=>(x as any).alerts.length===1)).toBe(true);
  });

  it('persists spend spike only over strict multiplier and excess boundaries, including older-window fallback', async () => {
    const t=(mins:number)=>new Date(start.getTime()+mins*60_000);
    const olderBaseline=[]; const currentSpike=[];
    olderBaseline.push(await addEvent({at:t(-130),cost:'0.100'})); currentSpike.push(await addEvent({at:t(-10),cost:'0.301'}));
    // Strict multiplier negative: baseline .10, current .30 exactly 3x.
    olderBaseline.push(await addEvent({at:t(-130),cost:'0.100'})); currentSpike.push(await addEvent({at:t(-9),cost:'0.300'}));
    // Strict excess negative: baseline .010, current .110 exactly +.10.
    olderBaseline.push(await addEvent({at:t(-130),cost:'0.010'})); currentSpike.push(await addEvent({at:t(-8),cost:'0.110'}));
    const windowStart=t(-60), windowEnd=t(0); await run(DetectorType.SPEND_SPIKE,windowStart,windowEnd);
    const rows=await findings(DetectorType.SPEND_SPIKE); expect(rows.length).toBeGreaterThan(0);
    const row=rows.find((x:any)=>(x.evidence as any).baselineWindow==='two-windows-ago');
    expect(row).toBeDefined();
    expect((row as any).usageLinks.map((x:any)=>x.usageRecordId).sort()).toEqual([...olderBaseline,...currentSpike].map(x=>x.id).sort());
    expect((row as any).usageLinks.filter((x:any)=>x.role==='current')).toHaveLength(currentSpike.length);
    expect((row as any).usageLinks.filter((x:any)=>x.role==='baseline')).toHaveLength(olderBaseline.length);
    expect(rows.every((x:any)=>x.alerts.length===1)).toBe(true);
  });

  it('matches the automatic 10-minute comparison windows and ignores a 70-minute-old baseline', async () => {
    const t=(mins:number)=>new Date(start.getTime()+mins*60_000);
    const baseline=await addEvent({at:t(395),cost:'0.001'});
    const spike=await addEvent({at:t(405),cost:'0.111'});
    const positiveRunId=await run(DetectorType.SPEND_SPIKE,t(400),t(410));
    const positiveRun=await prisma.detectionRun.findUniqueOrThrow({where:{id:positiveRunId},select:{findingsCreated:true}});
    const positiveRows=await findings(DetectorType.SPEND_SPIKE);
    const positiveFinding=positiveRows.find((x:any)=>x.detectionRunId===positiveRunId);
    expect(positiveRun.findingsCreated).toBe(1);
    expect((positiveFinding as any).evidence).toMatchObject({baselineWindow:'immediate-previous',currentCost:'0.1110000000',baselineCost:'0.0010000000'});
    expect((positiveFinding as any).usageLinks.map((x:any)=>x.usageRecordId).sort()).toEqual([baseline.id,spike.id].sort());
    expect((positiveFinding as any).alerts).toHaveLength(1);

    const staleBaseline=await addEvent({at:t(430),cost:'0.001'});
    const isolatedSpike=await addEvent({at:t(505),cost:'0.111'});
    const negativeRunId=await run(DetectorType.SPEND_SPIKE,t(500),t(510));
    const negativeRun=await prisma.detectionRun.findUniqueOrThrow({where:{id:negativeRunId},select:{findingsCreated:true}});
    const negativeFinding=await prisma.detectionFinding.findFirst({where:{detectionRunId:negativeRunId}});
    expect(negativeRun.findingsCreated).toBe(0);
    expect(negativeFinding).toBeNull();
    expect(staleBaseline.id).not.toBe(isolatedSpike.id);
  });

  it('persists no finding at either exact strict spend-spike boundary and one just above both', async () => {
    const t=(mins:number)=>new Date(start.getTime()+mins*60_000);
    const cases=[
      {offset:600,baseline:'0.100',current:'0.300',expected:0},
      {offset:650,baseline:'0.010',current:'0.110',expected:0},
      {offset:700,baseline:'0.010',current:'0.111',expected:1},
    ];
    for(const item of cases){
      await addEvent({at:t(item.offset-15),cost:item.baseline});
      await addEvent({at:t(item.offset+5),cost:item.current});
      const runId=await run(DetectorType.SPEND_SPIKE,t(item.offset),t(item.offset+10));
      const runRow=await prisma.detectionRun.findUniqueOrThrow({where:{id:runId},select:{findingsCreated:true}});
      expect(runRow.findingsCreated).toBe(item.expected);
    }
  });
});
