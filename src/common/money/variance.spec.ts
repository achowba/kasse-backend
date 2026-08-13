import { calculateVariance, MissingSpendPolicyEnum } from './variance';

describe('calculateVariance', () => {
  describe('the sample data published with the assignment', () => {
    // Amounts are in minor units: 5,000.00 is 500000.
    const cases = [
      { name: '2026-01 Marketing', plan: 500_000, spent: 480_000, variance: -20_000, percent: -4 },
      { name: '2026-01 Payroll', plan: 2_000_000, spent: 2_050_000, variance: 50_000, percent: 2.5 },
      { name: '2026-02 Payroll', plan: 2_000_000, spent: 1_980_000, variance: -20_000, percent: -1 },
    ];

    it.each(cases)('reproduces $name', ({ plan, spent, variance, percent }) => {
      const result = calculateVariance(plan, spent);

      expect(result.varianceMinor).toBe(variance);
      expect(result.variancePercent).toBe(percent);
    });

    it('reproduces 2026-02 Marketing, where the spend is deliberately absent', () => {
      const result = calculateVariance(500_000, null);

      expect(result.spentMinor).toBe(0);
      expect(result.varianceMinor).toBe(-500_000);
      expect(result.variancePercent).toBe(-100);
      expect(result.hasSpend).toBe(false);
    });
  });

  describe('a plan of zero', () => {
    it('returns null for the percentage rather than Infinity', () => {
      const result = calculateVariance(0, 25_000);

      expect(result.variancePercent).toBeNull();
      expect(Number.isFinite(result.variancePercent as number)).toBe(false);
    });

    it('still reports the absolute variance, because unplanned spend is real', () => {
      expect(calculateVariance(0, 25_000).varianceMinor).toBe(25_000);
    });

    it('returns null for the percentage rather than NaN when nothing was spent either', () => {
      const result = calculateVariance(0, 0);

      expect(result.varianceMinor).toBe(0);
      expect(result.variancePercent).toBeNull();
    });
  });

  describe('missing spend', () => {
    it('counts as zero under the default policy', () => {
      const result = calculateVariance(100_000, null, MissingSpendPolicyEnum.ZERO);

      expect(result.spentMinor).toBe(0);
      expect(result.varianceMinor).toBe(-100_000);
      expect(result.variancePercent).toBe(-100);
    });

    it('reports null throughout under the null policy', () => {
      const result = calculateVariance(100_000, null, MissingSpendPolicyEnum.NULL);

      expect(result.spentMinor).toBeNull();
      expect(result.varianceMinor).toBeNull();
      expect(result.variancePercent).toBeNull();
    });

    it('keeps the plan visible under either policy', () => {
      expect(calculateVariance(100_000, null, MissingSpendPolicyEnum.ZERO).planMinor).toBe(100_000);
      expect(calculateVariance(100_000, null, MissingSpendPolicyEnum.NULL).planMinor).toBe(100_000);
    });
  });

  describe('distinguishing a logged zero from nothing logged', () => {
    it('reports hasSpend true for a logged zero', () => {
      const result = calculateVariance(100_000, 0);

      expect(result.hasSpend).toBe(true);
      expect(result.spentMinor).toBe(0);
    });

    it('reports hasSpend false when nothing was logged, even though the spend reads zero', () => {
      const result = calculateVariance(100_000, null, MissingSpendPolicyEnum.ZERO);

      expect(result.hasSpend).toBe(false);
      expect(result.spentMinor).toBe(0);
    });
  });

  describe('sign and rounding', () => {
    it('treats overspend as positive and underspend as negative', () => {
      expect(calculateVariance(100_000, 120_000).varianceMinor).toBe(20_000);
      expect(calculateVariance(100_000, 80_000).varianceMinor).toBe(-20_000);
    });

    it('rounds the percentage to two decimal places', () => {
      // 1 of 30000 is 0.00333..., which must not leak float noise into a response.
      expect(calculateVariance(3_000_000, 3_000_100).variancePercent).toBe(0);
      expect(calculateVariance(300_000, 300_100).variancePercent).toBe(0.03);
    });

    it('handles negative spend, which a refund produces', () => {
      const result = calculateVariance(100_000, -5_000);

      expect(result.varianceMinor).toBe(-105_000);
      expect(result.variancePercent).toBe(-105);
    });

    it('reports exactly zero variance when spend matches plan', () => {
      const result = calculateVariance(100_000, 100_000);

      expect(result.varianceMinor).toBe(0);
      expect(result.variancePercent).toBe(0);
    });
  });

  describe('negative zero', () => {
    it('returns a positive zero when a tiny underspend rounds to nothing', () => {
      const result = calculateVariance(1_000_000, 999_999);

      // -0.0001% rounds to -0 through Math.round. It compares equal to 0 and
      // serialises as 0, so nothing downstream would have noticed, right up
      // until something divided by it and got -Infinity.
      expect(result.variancePercent).toBe(0);
      expect(Object.is(result.variancePercent, -0)).toBe(false);
    });

    it('returns a positive zero for a tiny overspend too', () => {
      expect(Object.is(calculateVariance(1_000_000, 1_000_001).variancePercent, -0)).toBe(false);
    });

    it('still reports the sign when the variance is large enough to show', () => {
      expect(calculateVariance(1_000_000, 990_000).variancePercent).toBe(-1);
    });
  });
});
