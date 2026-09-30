import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { buildConfiguration, type Configuration } from './configuration';
import { validateEnvironment } from './env.validation';

/**
 * Injection token for the fully-built, validated configuration tree.
 *
 * Prefer this over `ConfigService.get(...)`: it is typed end-to-end, so a
 * configuration mistake is a compile error rather than a runtime `undefined`.
 *
 * ```ts
 * constructor(@Inject(APP_CONFIG) private readonly config: Configuration) {}
 * ```
 */
export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // `.env` is a local-development convenience; real deployments inject
      // environment variables into the process directly.
      envFilePath: ['.env'],
      cache: true,
      // Runs first and aborts startup with a readable diagnostic. Nest then
      // copies the validated values back onto `process.env`.
      validate: validateEnvironment,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): Configuration =>
        // Re-validating is cheap and yields the typed instance. By this point
        // ConfigModule has merged any `.env` values into `process.env`, so this
        // sees exactly what was validated above.
        buildConfiguration(validateEnvironment(process.env)),
    },
  ],
  exports: [APP_CONFIG, NestConfigModule],
})
export class AppConfigModule {}
