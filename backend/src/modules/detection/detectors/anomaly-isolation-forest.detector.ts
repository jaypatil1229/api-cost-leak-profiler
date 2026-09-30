import { Injectable, Logger } from '@nestjs/common';
import { DetectorKind, DetectorType } from '@prisma/client';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class AnomalyIsolationForestDetector implements Detector {
  private readonly logger = new Logger(AnomalyIsolationForestDetector.name);

  readonly type = DetectorType.ANOMALY_ISOLATION_FOREST;
  readonly kind = DetectorKind.ADVANCED;
  readonly version = '0.1.0-stub';
  readonly description =
    'Uses Isolation Forest from the Python analytics service to detect anomalous usage patterns. SCAFFOLDED — requires analytics service.';

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    this.logger.warn(
      `${this.type} detector is scaffolded. Analytics service integration not implemented. ` +
        `Context: org=${context.organizationId}, project=${context.projectId}`,
    );
    return { recordsScanned: 0, findings: [] };
  }
}
