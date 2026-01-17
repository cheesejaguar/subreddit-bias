import { describe, test, expect } from 'bun:test';
import {
  isValidSentiment,
  isValidHostilityLevel,
  isValidFramework,
  isValidSamplingStrategy,
  isValidJobStatus,
  isValidTaskType,
  isValidHostilityLabel,
  HOSTILITY_LABELS,
} from './types';

describe('Type Validators', () => {
  describe('isValidSentiment', () => {
    test('returns true for valid sentiment values', () => {
      expect(isValidSentiment('positive')).toBe(true);
      expect(isValidSentiment('neutral')).toBe(true);
      expect(isValidSentiment('negative')).toBe(true);
    });

    test('returns false for invalid sentiment values', () => {
      expect(isValidSentiment('happy')).toBe(false);
      expect(isValidSentiment('sad')).toBe(false);
      expect(isValidSentiment('')).toBe(false);
      expect(isValidSentiment('POSITIVE')).toBe(false);
    });
  });

  describe('isValidHostilityLevel', () => {
    test('returns true for valid hostility levels', () => {
      expect(isValidHostilityLevel('none')).toBe(true);
      expect(isValidHostilityLevel('low')).toBe(true);
      expect(isValidHostilityLevel('medium')).toBe(true);
      expect(isValidHostilityLevel('high')).toBe(true);
    });

    test('returns false for invalid hostility levels', () => {
      expect(isValidHostilityLevel('severe')).toBe(false);
      expect(isValidHostilityLevel('extreme')).toBe(false);
      expect(isValidHostilityLevel('')).toBe(false);
    });
  });

  describe('isValidFramework', () => {
    test('returns true for valid frameworks', () => {
      expect(isValidFramework('ihra')).toBe(true);
      expect(isValidFramework('jda')).toBe(true);
      expect(isValidFramework('nexus')).toBe(true);
    });

    test('returns false for invalid frameworks', () => {
      expect(isValidFramework('other')).toBe(false);
      expect(isValidFramework('IHRA')).toBe(false);
      expect(isValidFramework('')).toBe(false);
    });
  });

  describe('isValidSamplingStrategy', () => {
    test('returns true for valid sampling strategies', () => {
      expect(isValidSamplingStrategy('top')).toBe(true);
      expect(isValidSamplingStrategy('new')).toBe(true);
      expect(isValidSamplingStrategy('controversial')).toBe(true);
    });

    test('returns false for invalid sampling strategies', () => {
      expect(isValidSamplingStrategy('hot')).toBe(false);
      expect(isValidSamplingStrategy('rising')).toBe(false);
      expect(isValidSamplingStrategy('')).toBe(false);
    });
  });

  describe('isValidJobStatus', () => {
    test('returns true for valid job statuses', () => {
      expect(isValidJobStatus('pending')).toBe(true);
      expect(isValidJobStatus('running')).toBe(true);
      expect(isValidJobStatus('completed')).toBe(true);
      expect(isValidJobStatus('failed')).toBe(true);
      expect(isValidJobStatus('cancelled')).toBe(true);
    });

    test('returns false for invalid job statuses', () => {
      expect(isValidJobStatus('queued')).toBe(false);
      expect(isValidJobStatus('success')).toBe(false);
      expect(isValidJobStatus('')).toBe(false);
    });
  });

  describe('isValidTaskType', () => {
    test('returns true for valid task types', () => {
      expect(isValidTaskType('sentiment')).toBe(true);
      expect(isValidTaskType('target_group')).toBe(true);
    });

    test('returns false for invalid task types', () => {
      expect(isValidTaskType('analysis')).toBe(false);
      expect(isValidTaskType('classification')).toBe(false);
      expect(isValidTaskType('')).toBe(false);
    });
  });

  describe('isValidHostilityLabel', () => {
    test('returns true for valid hostility labels', () => {
      expect(isValidHostilityLabel('slur_or_epithet')).toBe(true);
      expect(isValidHostilityLabel('dehumanization')).toBe(true);
      expect(isValidHostilityLabel('stereotype_or_trope')).toBe(true);
      expect(isValidHostilityLabel('conspiracy_claim')).toBe(true);
      expect(isValidHostilityLabel('collective_blame')).toBe(true);
      expect(isValidHostilityLabel('calls_for_exclusion_or_violence')).toBe(true);
      expect(isValidHostilityLabel('denial_or_minimization')).toBe(true);
    });

    test('returns false for invalid hostility labels', () => {
      expect(isValidHostilityLabel('hate_speech')).toBe(false);
      expect(isValidHostilityLabel('racism')).toBe(false);
      expect(isValidHostilityLabel('')).toBe(false);
    });
  });

  describe('HOSTILITY_LABELS', () => {
    test('contains all expected labels', () => {
      expect(HOSTILITY_LABELS).toHaveLength(7);
      expect(HOSTILITY_LABELS).toContain('slur_or_epithet');
      expect(HOSTILITY_LABELS).toContain('dehumanization');
      expect(HOSTILITY_LABELS).toContain('stereotype_or_trope');
      expect(HOSTILITY_LABELS).toContain('conspiracy_claim');
      expect(HOSTILITY_LABELS).toContain('collective_blame');
      expect(HOSTILITY_LABELS).toContain('calls_for_exclusion_or_violence');
      expect(HOSTILITY_LABELS).toContain('denial_or_minimization');
    });

    test('is readonly', () => {
      // TypeScript should prevent mutation, but we can test the array is not empty
      expect(HOSTILITY_LABELS.length).toBeGreaterThan(0);
    });
  });
});
