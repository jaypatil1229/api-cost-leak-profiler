import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import {
  API_KEY_HEADER,
  API_PREFIX,
  API_VERSION,
  REQUEST_ID_HEADER,
} from './common/constants/app.constants';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { APP_CONFIG } from './config/config.module';
import type { Configuration } from './config/configuration';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<Configuration>(APP_CONFIG);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  app.use(
    helmet({
      // Swagger's inline UI assets need these relaxed in development only.
      contentSecurityPolicy: config.app.isProduction ? undefined : false,
    }),
  );

  app.enableCors({
    origin: config.http.corsAllowAll ? true : config.http.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', API_KEY_HEADER, REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
  });

  app.useGlobalPipes(createValidationPipe());

  if (config.docs.enabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ACLP API')
      .setDescription(
        'API Cost Leak Profiler REST API. Costs are estimates from versioned pricing, not invoice-grade billing.',
      )
      .setVersion(API_VERSION)
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, API_KEY_HEADER)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${API_PREFIX}/${config.docs.path}`, app, document, {
      jsonDocumentUrl: `${API_PREFIX}/${config.docs.path}/openapi.json`,
      customSiteTitle: 'ACLP API Docs',
    });
  }

  await app.listen(config.app.port);
  logger.log(`ACLP API listening on port ${config.app.port} (${config.app.env}).`);
}

void bootstrap();
