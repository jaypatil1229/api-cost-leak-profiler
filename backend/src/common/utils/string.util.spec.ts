import { normalizeEmail, slugify, isUuid } from './string.util';

describe('string.util', () => {
  describe('normalizeEmail', () => {
    it('should lowercase and trim email', () => {
      expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
    });

    it('should handle already normalized email', () => {
      expect(normalizeEmail('test@example.com')).toBe('test@example.com');
    });
  });

  describe('slugify', () => {
    it('should convert text to slug', () => {
      expect(slugify('Acme Inc')).toBe('acme-inc');
    });

    it('should handle special characters', () => {
      expect(slugify('Hello World!!!')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('Multiple   Spaces')).toBe('multiple-spaces');
    });

    it('should handle leading/trailing dashes', () => {
      expect(slugify('--test--')).toBe('test');
    });

    it('should handle empty string', () => {
      expect(slugify('')).toBe('');
    });

    it('should handle unicode characters', () => {
      expect(slugify('Café résumé')).toBe('cafe-resume');
    });
  });

  describe('isUuid', () => {
    it('should accept valid UUID v4', () => {
      expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(isUuid('not-a-uuid')).toBe(false);
      expect(isUuid('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isUuid('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isUuid(null as unknown as string)).toBe(false);
      expect(isUuid(undefined as unknown as string)).toBe(false);
    });
  });
});
