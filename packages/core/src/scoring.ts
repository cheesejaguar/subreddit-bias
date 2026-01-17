/**
 * Scoring module for processing classification results
 * Handles both heuristic and LLM classification outputs
 */

import type {
  SentimentValue,
  SentimentClassification,
  TargetGroupClassification,
  HostilityLevel,
  HostilityLabel,
  FrameworkType,
  isValidHostilityLabel,
} from '@subreddit-bias/db';
import { HOSTILITY_LABELS } from '@subreddit-bias/db';

// LLM sentiment response format
export interface LLMSentimentResponse {
  id: string;
  sentiment: string;
  subjectivity: number;
  confidence: number;
}

// LLM target group response format
export interface LLMTargetGroupResponse {
  id: string;
  mentions_group: boolean;
  hostility_level: string;
  labels: string[];
  confidence: number;
  rationale: string;
}

// Scoring options
export interface ScoringOptions {
  model: string;
  promptVersion: string;
  fromCache: boolean;
}

/**
 * Validate and normalize sentiment value
 */
export function normalizeSentiment(value: string): SentimentValue {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'positive' || normalized === 'pos' || normalized === '+') {
    return 'positive';
  }
  if (normalized === 'negative' || normalized === 'neg' || normalized === '-') {
    return 'negative';
  }
  return 'neutral';
}

/**
 * Validate and normalize hostility level
 */
export function normalizeHostilityLevel(value: string): HostilityLevel {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'high' || normalized === 'severe') {
    return 'high';
  }
  if (normalized === 'medium' || normalized === 'moderate') {
    return 'medium';
  }
  if (normalized === 'low' || normalized === 'mild') {
    return 'low';
  }
  return 'none';
}

/**
 * Validate and normalize hostility labels
 */
export function normalizeHostilityLabels(labels: string[]): HostilityLabel[] {
  const validLabels: HostilityLabel[] = [];

  for (const label of labels) {
    const normalized = label.toLowerCase().trim().replace(/\s+/g, '_');
    if (HOSTILITY_LABELS.includes(normalized as HostilityLabel)) {
      validLabels.push(normalized as HostilityLabel);
    }
  }

  return [...new Set(validLabels)]; // Remove duplicates
}

/**
 * Clamp a number to a range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Process LLM sentiment response into classification
 */
export function processSentimentResponse(
  response: LLMSentimentResponse,
  options: ScoringOptions
): SentimentClassification {
  return {
    commentId: response.id,
    sentiment: normalizeSentiment(response.sentiment),
    subjectivity: clamp(response.subjectivity, 0, 1),
    confidence: clamp(response.confidence, 0, 1),
    fromCache: options.fromCache,
    modelUsed: options.model,
    promptVersion: options.promptVersion,
  };
}

/**
 * Process multiple LLM sentiment responses
 */
export function processSentimentResponses(
  responses: LLMSentimentResponse[],
  options: ScoringOptions
): SentimentClassification[] {
  return responses.map(r => processSentimentResponse(r, options));
}

/**
 * Process LLM target group response into classification
 */
export function processTargetGroupResponse(
  response: LLMTargetGroupResponse,
  framework: FrameworkType,
  targetGroup: string,
  options: ScoringOptions
): TargetGroupClassification {
  return {
    commentId: response.id,
    framework,
    mentionsGroup: response.mentions_group,
    targetGroup,
    hostilityLevel: normalizeHostilityLevel(response.hostility_level),
    labels: normalizeHostilityLabels(response.labels),
    confidence: clamp(response.confidence, 0, 1),
    rationale: response.rationale || '',
    fromCache: options.fromCache,
    modelUsed: options.model,
    promptVersion: options.promptVersion,
  };
}

/**
 * Process multiple LLM target group responses
 */
export function processTargetGroupResponses(
  responses: LLMTargetGroupResponse[],
  framework: FrameworkType,
  targetGroup: string,
  options: ScoringOptions
): TargetGroupClassification[] {
  return responses.map(r => processTargetGroupResponse(r, framework, targetGroup, options));
}

/**
 * Create sentiment classification from heuristic result
 */
export function createHeuristicSentimentClassification(
  commentId: string,
  sentiment: SentimentValue,
  confidence: number
): SentimentClassification {
  return {
    commentId,
    sentiment,
    subjectivity: sentiment === 'neutral' ? 0.2 : 0.5, // Default subjectivity
    confidence: clamp(confidence, 0, 1),
    fromCache: false,
    modelUsed: 'heuristic',
    promptVersion: 'heuristic-1.0.0',
  };
}

/**
 * Create target group classification from heuristic result
 */
export function createHeuristicTargetGroupClassification(
  commentId: string,
  framework: FrameworkType,
  targetGroup: string,
  mentionsGroup: boolean,
  hostilityLevel: HostilityLevel,
  labels: HostilityLabel[],
  confidence: number
): TargetGroupClassification {
  return {
    commentId,
    framework,
    mentionsGroup,
    targetGroup,
    hostilityLevel,
    labels,
    confidence: clamp(confidence, 0, 1),
    rationale: 'Classified by heuristic rules',
    fromCache: false,
    modelUsed: 'heuristic',
    promptVersion: 'heuristic-1.0.0',
  };
}

/**
 * Calculate weighted confidence based on classification source
 */
export function calculateWeightedConfidence(
  classifications: Array<{ confidence: number; fromCache: boolean; modelUsed: string }>
): number {
  if (classifications.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const c of classifications) {
    // Weight by model type and source
    let weight = 1.0;
    if (c.modelUsed === 'heuristic') {
      weight = 0.7; // Lower weight for heuristics
    } else if (c.modelUsed.includes('gpt-4')) {
      weight = 1.0; // Full weight for GPT-4
    } else if (c.modelUsed.includes('gpt-3.5')) {
      weight = 0.85; // Slightly lower for GPT-3.5
    }

    // Slight penalty for cached results (may be stale)
    if (c.fromCache) {
      weight *= 0.95;
    }

    weightedSum += c.confidence * weight;
    totalWeight += weight;
  }

  return weightedSum / totalWeight;
}

/**
 * Determine if classification results indicate high hostility
 */
export function isHighHostility(classifications: TargetGroupClassification[]): boolean {
  return classifications.some(c => c.hostilityLevel === 'high');
}

/**
 * Determine if classification results indicate any hostility
 */
export function hasAnyHostility(classifications: TargetGroupClassification[]): boolean {
  return classifications.some(c => c.hostilityLevel !== 'none');
}

/**
 * Get unique hostility labels from classifications
 */
export function getUniqueLabels(classifications: TargetGroupClassification[]): HostilityLabel[] {
  const labelSet = new Set<HostilityLabel>();
  for (const c of classifications) {
    for (const label of c.labels) {
      labelSet.add(label);
    }
  }
  return Array.from(labelSet);
}

/**
 * Validate LLM response structure for sentiment
 */
export function validateSentimentResponse(response: unknown): response is LLMSentimentResponse {
  if (typeof response !== 'object' || response === null) return false;
  const r = response as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.sentiment === 'string' &&
    typeof r.subjectivity === 'number' &&
    typeof r.confidence === 'number'
  );
}

/**
 * Validate LLM response structure for target group
 */
export function validateTargetGroupResponse(response: unknown): response is LLMTargetGroupResponse {
  if (typeof response !== 'object' || response === null) return false;
  const r = response as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.mentions_group === 'boolean' &&
    typeof r.hostility_level === 'string' &&
    Array.isArray(r.labels) &&
    typeof r.confidence === 'number' &&
    typeof r.rationale === 'string'
  );
}

/**
 * Parse and validate batch sentiment response
 */
export function parseSentimentBatchResponse(
  jsonResponse: unknown
): { valid: LLMSentimentResponse[]; invalid: number } {
  if (!Array.isArray(jsonResponse)) {
    return { valid: [], invalid: 1 };
  }

  const valid: LLMSentimentResponse[] = [];
  let invalid = 0;

  for (const item of jsonResponse) {
    if (validateSentimentResponse(item)) {
      valid.push(item);
    } else {
      invalid++;
    }
  }

  return { valid, invalid };
}

/**
 * Parse and validate batch target group response
 */
export function parseTargetGroupBatchResponse(
  jsonResponse: unknown
): { valid: LLMTargetGroupResponse[]; invalid: number } {
  if (!Array.isArray(jsonResponse)) {
    return { valid: [], invalid: 1 };
  }

  const valid: LLMTargetGroupResponse[] = [];
  let invalid = 0;

  for (const item of jsonResponse) {
    if (validateTargetGroupResponse(item)) {
      valid.push(item);
    } else {
      invalid++;
    }
  }

  return { valid, invalid };
}
