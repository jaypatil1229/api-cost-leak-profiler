import { validateEnvironment } from './env.validation';

const baseEnvironment = {
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  API_KEY_HMAC_SECRET: 'c'.repeat(48),
};

describe('analytics environment configuration', () => {
  it('requires the analytics URL and service token to be configured together', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        ANALYTICS_SERVICE_URL: 'http://127.0.0.1:8000',
      }),
    ).toThrow('ANALYTICS_SERVICE_URL and ANALYTICS_SERVICE_TOKEN must both be set');

    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        ANALYTICS_SERVICE_TOKEN: 'd'.repeat(48),
      }),
    ).toThrow('ANALYTICS_SERVICE_URL and ANALYTICS_SERVICE_TOKEN must both be set');
  });

  it('accepts a complete analytics connection with a sufficiently long token', () => {
    const config = validateEnvironment({
      ...baseEnvironment,
      ANALYTICS_SERVICE_URL: 'http://127.0.0.1:8000',
      ANALYTICS_SERVICE_TOKEN: 'd'.repeat(48),
    });

    expect(config.ANALYTICS_SERVICE_URL).toBe('http://127.0.0.1:8000');
    expect(config.ANALYTICS_SERVICE_TOKEN).toBe('d'.repeat(48));
  });
});

describe('automatic detection environment configuration', () => {
  it('defaults to one-minute deterministic runs with a ten-minute lookback', () => {
    const config = validateEnvironment(baseEnvironment);

    expect(config.AUTOMATED_DETECTION_ENABLED).toBe(true);
    expect(config.AUTOMATED_DETECTION_INTERVAL_MS).toBe(60_000);
    expect(config.AUTOMATED_DETECTION_LOOKBACK_MS).toBe(600_000);
    expect(config.AUTOMATED_DETECTION_DETECTORS).toBe('deterministic');
    expect(config.AUTOMATED_DETECTION_MAX_CONCURRENCY).toBe(4);
    expect(config.AUTOMATED_DETECTION_TIMEOUT_MS).toBe(30_000);
  });

  it('validates scheduler bounds and detector modes', () => {
    expect(() =>
      validateEnvironment({ ...baseEnvironment, AUTOMATED_DETECTION_INTERVAL_MS: '14999' }),
    ).toThrow();
    expect(() =>
      validateEnvironment({ ...baseEnvironment, AUTOMATED_DETECTION_LOOKBACK_MS: '59999' }),
    ).toThrow();
    expect(() =>
      validateEnvironment({ ...baseEnvironment, AUTOMATED_DETECTION_MAX_CONCURRENCY: '17' }),
    ).toThrow();
    expect(() =>
      validateEnvironment({ ...baseEnvironment, AUTOMATED_DETECTION_DETECTORS: 'semantic' }),
    ).toThrow();

    const analytics = validateEnvironment({
      ...baseEnvironment,
      AUTOMATED_DETECTION_DETECTORS: 'analytics',
      AUTOMATED_DETECTION_ENABLED: 'false',
    });
    expect(analytics.AUTOMATED_DETECTION_DETECTORS).toBe('analytics');
    expect(analytics.AUTOMATED_DETECTION_ENABLED).toBe(false);
  });
});
