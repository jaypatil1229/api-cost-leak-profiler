import { Module } from '@nestjs/common';

import { DetectionModule } from '../detection/detection.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DetectionModule],
  controllers: [HealthController],
})
export class HealthModule {}
