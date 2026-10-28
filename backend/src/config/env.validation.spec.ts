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
