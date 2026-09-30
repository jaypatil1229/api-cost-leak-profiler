import { Injectable, Logger } from '@nestjs/common';
import { DetectorKind, DetectorType } from '@prisma/client';

import type { Detector, DetectorResult, DetectorRunContext } from './detector.interface';

@Injectable()
export class SemanticDuplicateDetector implements Detector {
  private readonly logger = new Logger(SemanticDuplicateDetector.name);

  readonly type = DetectorType.SEMANTIC_DUPLICATE;
  readonly kind = DetectorKind.ADVANCED;
  readonly version = '0.1.0-stub';
  readonly description =
    'Uses embedding similarity from the Python analytics service to find semantically duplicate prompts. SCAFFOLDED — requires analytics service.';

  async run(context: DetectorRunContext): Promise<DetectorResult> {
    this.logger.warn(
      `${this.type} detector is scaffolded. Analytics service integration not implemented. ` +
        `Context: org=${context.organizationId}, project=${context.projectId}`,
    );
    return { recordsScanned: 0, findings: [] };
  }
}
