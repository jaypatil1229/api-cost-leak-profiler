import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Database access is centralised here so every module depends on a single
 * PrismaClient instance (connection pooling) and a single lifecycle owner.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
