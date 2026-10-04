import { sanitizeMetadata } from './metadata.util';

describe('sanitizeMetadata', () => {
  it('drops generic token and sensitive-content keys while keeping safe metadata', () => {
    const result = sanitizeMetadata({
      env: 'test',
      requestId: 'req-123',
      token: 'sensitive',
      authorization: 'sensitive',
      password: 'sensitive',
      secret: 'sensitive',
      prompt: 'private prompt',
      completion: 'private completion',
      content: 'private content',
      tokenUsage: 'safe descriptive value',
    });

    expect(result.metadata).toEqual({
      env: 'test',
      requestId: 'req-123',
      tokenUsage: 'safe descriptive value',
    });
  });
});
