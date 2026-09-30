import { Injectable, Logger } from '@nestjs/common';
import type { DetectorType, DetectorKind } from '@prisma/client';

import type { Detector } from './detector.interface';

@Injectable()
export class DetectorRegistry {
  private readonly logger = new Logger(DetectorRegistry.name);
  private readonly detectors = new Map<DetectorType, Detector>();

  register(detector: Detector): void {
    if (this.detectors.has(detector.type)) {
      this.logger.warn(`Overwriting detector registration for ${detector.type}`);
    }
    this.detectors.set(detector.type, detector);
    this.logger.log(`Registered detector: ${detector.type} (${detector.kind}, v${detector.version})`);
  }

  get(type: DetectorType): Detector | undefined {
    return this.detectors.get(type);
  }

  getAll(): Detector[] {
    return Array.from(this.detectors.values());
  }

  getByKind(kind: DetectorKind): Detector[] {
    return this.getAll().filter((d) => d.kind === kind);
  }

  has(type: DetectorType): boolean {
    return this.detectors.has(type);
  }

  listRegistered(): Array<{ type: DetectorType; kind: DetectorKind; version: string; description: string }> {
    return this.getAll().map((d) => ({
      type: d.type,
      kind: d.kind,
      version: d.version,
      description: d.description,
    }));
  }
}
