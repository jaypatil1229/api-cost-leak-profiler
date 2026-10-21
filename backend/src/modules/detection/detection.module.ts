import { Module, OnModuleInit } from '@nestjs/common';

import { DetectionController } from './detection.controller';
import { AlertsController } from './alerts.controller';
import { DetectionService } from './detection.service';
import { AnalyticsClient } from './analytics.client';
import { AlertsService } from './alerts.service';
import {
  DetectorRegistry,
  DuplicatePromptDetector,
  RetryLoopDetector,
  UnboundedContextDetector,
  OversizedPromptDetector,
  SpendSpikeDetector,
  AnomalyIsolationForestDetector,
  SemanticDuplicateDetector,
} from './detectors';

const DETECTORS = [
  DuplicatePromptDetector,
  RetryLoopDetector,
  UnboundedContextDetector,
  OversizedPromptDetector,
  SpendSpikeDetector,
  AnomalyIsolationForestDetector,
  SemanticDuplicateDetector,
];

@Module({
  controllers: [DetectionController, AlertsController],
  providers: [DetectionService, AlertsService, DetectorRegistry, AnalyticsClient, ...DETECTORS],
  exports: [DetectionService, AlertsService, DetectorRegistry],
})
export class DetectionModule implements OnModuleInit {
  constructor(
    private readonly registry: DetectorRegistry,
    private readonly duplicatePrompt: DuplicatePromptDetector,
    private readonly retryLoop: RetryLoopDetector,
    private readonly unboundedContext: UnboundedContextDetector,
    private readonly oversizedPrompt: OversizedPromptDetector,
    private readonly spendSpike: SpendSpikeDetector,
    private readonly anomalyIsolationForest: AnomalyIsolationForestDetector,
    private readonly semanticDuplicate: SemanticDuplicateDetector,
  ) {}

  onModuleInit() {
    this.registry.register(this.duplicatePrompt);
    this.registry.register(this.retryLoop);
    this.registry.register(this.unboundedContext);
    this.registry.register(this.oversizedPrompt);
    this.registry.register(this.spendSpike);
    this.registry.register(this.anomalyIsolationForest);
    this.registry.register(this.semanticDuplicate);
  }
}
