import { Module } from '@nestjs/common';

import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyVerificationService } from './api-key-verification.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyVerificationService, ApiKeyAuthGuard],
  exports: [ApiKeysService, ApiKeyVerificationService, ApiKeyAuthGuard],
})
export class ApiKeysModule {}
