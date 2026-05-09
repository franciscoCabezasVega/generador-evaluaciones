import { calculateTaskScore, calculateTeamScore, validateReturns } from '@/lib/scoreCalculator';

describe('Score Calculator', () => {
  describe('calculateTaskScore', () => {
    it('should return 10 for no returns', () => {
      const score = calculateTaskScore({
        lowReturns: 0,
        mediumReturns: 0,
        highReturns: 0,
      });
      expect(score).toBe(10);
    });

    it('should deduct 1.50 for each high return', () => {
      const score = calculateTaskScore({
        lowReturns: 0,
        mediumReturns: 0,
        highReturns: 2,
      });
      expect(score).toBe(10 - 1.5 * 2); // 7.00
    });

    it('should deduct 0.75 for each medium return', () => {
      const score = calculateTaskScore({
        lowReturns: 0,
        mediumReturns: 3,
        highReturns: 0,
      });
      expect(score).toBe(7.8); // 10 - 2.25 = 7.75 → redondeado a 1 decimal = 7.8
    });

    it('should deduct 0.50 for every 5 low returns', () => {
      const score = calculateTaskScore({
        lowReturns: 5,
        mediumReturns: 0,
        highReturns: 0,
      });
      expect(score).toBe(10 - 0.5); // 9.50
    });

    it('should not deduct for less than 5 low returns', () => {
      const score = calculateTaskScore({
        lowReturns: 4,
        mediumReturns: 0,
        highReturns: 0,
      });
      expect(score).toBe(10);
    });

    it('should deduct 1.00 for 10 low returns', () => {
      const score = calculateTaskScore({
        lowReturns: 10,
        mediumReturns: 0,
        highReturns: 0,
      });
      expect(score).toBe(10 - 1.0); // 9.00
    });

    it('should handle combined returns', () => {
      // 2 low, 3 medium, 1 high
      // 10 - 0 - (0.75 * 3) - (1.50 * 1) = 10 - 2.25 - 1.50 = 6.25 → redondeado a 1 decimal = 6.3
      const score = calculateTaskScore({
        lowReturns: 2,
        mediumReturns: 3,
        highReturns: 1,
      });
      expect(score).toBe(6.3);
    });

    it('should not go below 0', () => {
      const score = calculateTaskScore({
        lowReturns: 100,
        mediumReturns: 100,
        highReturns: 100,
      });
      expect(score).toBe(0);
    });

    it('should round to 1 decimal', () => {
      const score = calculateTaskScore({
        lowReturns: 1,
        mediumReturns: 1,
        highReturns: 1,
      });
      expect(score % 0.1).toBeLessThan(0.1);
    });
  });

  describe('calculateTeamScore', () => {
    it('should return 0 for empty array', () => {
      const score = calculateTeamScore([]);
      expect(score).toBe(0);
    });

    it('should return the same value for single task', () => {
      const score = calculateTeamScore([8.5]);
      expect(score).toBe(8.5);
    });

    it('should calculate average for multiple tasks', () => {
      const score = calculateTeamScore([10, 9, 8, 7]);
      expect(score).toBe(8.5);
    });

    it('should handle decimal scores', () => {
      const score = calculateTeamScore([7.5, 8.25, 9.5]);
      expect(score).toBe(8.4); // 25.25 / 3 = 8.4166... → redondeado a 1 decimal = 8.4
    });

    it('should round to 1 decimal', () => {
      const score = calculateTeamScore([7.33, 8.33, 9.33]);
      expect(score % 0.1).toBeLessThan(0.1);
    });
  });

  describe('validateReturns', () => {
    it('should accept valid integers', () => {
      expect(validateReturns(0)).toBe(true);
      expect(validateReturns(5)).toBe(true);
      expect(validateReturns(100)).toBe(true);
    });

    it('should reject negative numbers', () => {
      expect(validateReturns(-1)).toBe(false);
      expect(validateReturns(-10)).toBe(false);
    });

    it('should reject decimals', () => {
      expect(validateReturns(5.5)).toBe(false);
      expect(validateReturns(3.14)).toBe(false);
    });

    it('should reject letters', () => {
      expect(validateReturns('abc')).toBe(false);
      expect(validateReturns('5a')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(validateReturns('@#$')).toBe(false);
      expect(validateReturns('5!')).toBe(false);
    });

    it('should accept empty or null', () => {
      expect(validateReturns('')).toBe(true);
      expect(validateReturns(null)).toBe(true);
      expect(validateReturns(undefined)).toBe(true);
    });

    it('should accept string numbers', () => {
      expect(validateReturns('5')).toBe(true);
      expect(validateReturns('0')).toBe(true);
      expect(validateReturns('100')).toBe(true);
    });
  });
});
