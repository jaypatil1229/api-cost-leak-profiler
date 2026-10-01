import { Prisma } from '@prisma/client';

import { estimateCost, percentageChange, toMoneyString } from './money.util';

describe('money.util', () => {
  describe('estimateCost', () => {
    it('should calculate cost correctly', () => {
      const result = estimateCost(1000000, new Prisma.Decimal('5.00'));
      expect(result.toNumber()).toBe(5.0);
    });

    it('should handle fractional tokens', () => {
      const result = costForTokens(1500000, new Prisma.Decimal('2.00'));
      expect(result.toNumber()).toBe(3.0);
    });

    it('should return zero for zero tokens', () => {
      const result = costForTokens(0, new Prisma.Decimal('10.00'));
      expect(result.toNumber()).toBe(0);
    });

    it('should preserve precision', () => {
      const result = costForTokens(123456, new Prisma.Decimal('1.23456789'));
      expect(result.toString()).toBe('0.1524157751');
    });
  });

  describe('percentageChange', () => {
    it('should calculate positive percentage change', () => {
      const current = new Prisma.Decimal('150');
      const previous = new Prisma.Decimal('100');
      expect(percentageChange(current, previous)).toBe(50.0);
    });

    it('should calculate negative percentage change', () => {
      const current = new Prisma.Decimal('75');
      const previous = new Prisma.Decimal('100');
      expect(percentageChange(current, previous)).toBe(-25.0);
    });

    it('should return null when previous is zero', () => {
      const current = new Prisma.Decimal('100');
      const previous = new Prisma.Decimal('0');
      expect(percentageChange(current, previous)).toBeNull();
    });
  });

  describe('toMoneyString', () => {
    it('should format decimal to 2 decimal places', () => {
      expect(toMoneyString(new Prisma.Decimal('123.456'))).toBe('123.46');
    });

    it('should format null as null', () => {
      expect(toMoneyString(null)).toBeNull();
    });

    it('should format undefined as null', () => {
      expect(toMoneyString(undefined)).toBeNull();
    });

    it('should round correctly', () => {
      expect(toMoneyString(new Prisma.Decimal('0.995'))).toBe('1.00');
      expect(toMoneyString(new Prisma.Decimal('0.994'))).toBe('0.99');
    });
  });
});
