import { describe, it, expect } from 'vitest';
import { AVAILABLE_FIELDS } from '../../../src/utils/fsrs-table-params';

describe('fsrs-table-params', () => {
  describe('AVAILABLE_FIELDS', () => {
    it('should contain all expected fields', () => {
      const expectedFields = [
        'file',
        'reps',
        'overdue',
        'stability',
        'difficulty',
        'retrievability',
        'due',
        'state',
        'elapsed',
        'scheduled',
      ];

      expect(AVAILABLE_FIELDS.size).toBe(expectedFields.length);

      for (const field of expectedFields) {
        expect(AVAILABLE_FIELDS.has(field)).toBe(true);
      }
    });

    it('should not contain unexpected fields', () => {
      // Ensure we haven't accidentally added extra fields
      const allowedFields = new Set([
        'file',
        'reps',
        'overdue',
        'stability',
        'difficulty',
        'retrievability',
        'due',
        'state',
        'elapsed',
        'scheduled',
      ]);

      for (const field of AVAILABLE_FIELDS) {
        expect(allowedFields.has(field)).toBe(true);
      }
    });

    it('should have exactly 10 fields', () => {
      expect(AVAILABLE_FIELDS.size).toBe(10);
    });
  });
});
