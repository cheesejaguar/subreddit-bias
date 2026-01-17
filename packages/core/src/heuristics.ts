/**
 * Local heuristics for Stage A of the two-stage cascade
 * These provide cheap, fast classification for obvious cases
 * to minimize LLM API calls
 */

import type { SentimentValue, HostilityLevel } from '@subreddit-bias/db';

// Result from heuristic analysis
export interface HeuristicResult {
  // If confident is true, LLM call can be skipped
  confident: boolean;
  // Suggested classification (only valid if confident)
  suggestion: {
    sentiment?: SentimentValue;
    hostilityLevel?: HostilityLevel;
    hasTargetGroupMention?: boolean;
  };
  // Reason for the classification
  reason: string;
  // Indicators found
  indicators: string[];
}

// Simple lexicon-based sentiment indicators
const POSITIVE_WORDS = new Set([
  'love', 'great', 'awesome', 'amazing', 'excellent', 'wonderful', 'fantastic',
  'good', 'best', 'happy', 'glad', 'thanks', 'thank', 'appreciate', 'helpful',
  'beautiful', 'brilliant', 'perfect', 'incredible', 'outstanding', 'superb',
]);

const NEGATIVE_WORDS = new Set([
  'hate', 'terrible', 'awful', 'horrible', 'bad', 'worst', 'stupid',
  'dumb', 'idiotic', 'pathetic', 'disgusting', 'trash', 'garbage',
  'sucks', 'useless', 'waste', 'annoying', 'angry', 'furious',
]);

const NEUTRAL_INDICATORS = [
  /^(yes|no|ok|okay|sure|maybe|idk|tbh)\.?$/i,
  /^\d+$/,
  /^https?:\/\//i,
  /^r\/\w+$/i,
  /^u\/\w+$/i,
];

// Slurs and explicit hostility markers (partial list for detection)
const SLUR_PATTERNS = [
  // This is a simplified set - production would need careful curation
  /\b(k[i1]ke|n[i1]gger|f[a4]ggot|sp[i1]c|ch[i1]nk|wetback|beaner)\b/i,
];

// Dehumanization patterns
const DEHUMANIZATION_PATTERNS = [
  /\b(subhuman|vermin|cockroach|parasite|animal|beast|savage)\b/i,
  /\b(they('re| are) (all )?(animals|vermin|parasites))\b/i,
];

// Conspiracy patterns
const CONSPIRACY_PATTERNS = [
  /\b(control the (media|banks|world|government))\b/i,
  /\b((secret|global|world) (cabal|agenda|conspiracy))\b/i,
  /\b(pulling the strings)\b/i,
  /\b(globalist.*conspiracy|conspiracy.*globalist)\b/i,
];

// Calls for violence/exclusion
const VIOLENCE_PATTERNS = [
  /\b(should (be|all be) (killed|exterminated|eliminated|removed|deported))\b/i,
  /\b(death to|kill (all|them|every))\b/i,
  /\b(get rid of (all|them|every))\b/i,
];

// Common target groups for detection
const TARGET_GROUP_PATTERNS: Record<string, RegExp[]> = {
  jewish: [
    /\bjews?\b/i,
    /\bjewish\b/i,
    /\bisrael(i|is)?\b/i,
    /\bzionist(s)?\b/i,
    /\bsemit(ic|e|es)\b/i,
    /\bhebrew\b/i,
  ],
  muslim: [
    /\bmuslims?\b/i,
    /\bislam(ic)?\b/i,
    /\barab(s|ic)?\b/i,
    /\bmosque\b/i,
    /\bquran\b/i,
  ],
  black: [
    /\bblack (people|folks|community|americans?)\b/i,
    /\bafrican.?american\b/i,
  ],
  lgbtq: [
    /\blgbt(q|qia?)?\b/i,
    /\bgay(s)?\b/i,
    /\blesbian(s)?\b/i,
    /\btrans(gender)?\b/i,
    /\bqueer\b/i,
    /\bbisexual\b/i,
  ],
  asian: [
    /\basian(s)?\b/i,
    /\bchinese\b/i,
    /\bjapanese\b/i,
    /\bkorean\b/i,
  ],
  immigrant: [
    /\bimmigrant(s)?\b/i,
    /\bmigrant(s)?\b/i,
    /\billegal(s)?\b/i,
    /\balien(s)?\b/i,
    /\brefugee(s)?\b/i,
  ],
};

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Check if text is too short to analyze meaningfully
 */
export function isTooShort(text: string): boolean {
  const words = tokenize(text);
  return words.length < 3;
}

/**
 * Check if text is likely neutral/uninformative
 */
export function isLikelyNeutral(text: string): boolean {
  const trimmed = text.trim();

  // Check neutral patterns
  for (const pattern of NEUTRAL_INDICATORS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Very short texts are often neutral
  if (isTooShort(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Simple lexicon-based sentiment analysis
 */
export function analyzeSentimentLexicon(text: string): {
  positiveCount: number;
  negativeCount: number;
  totalWords: number;
  sentiment: SentimentValue | null;
  confidence: number;
} {
  const words = tokenize(text);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positiveCount++;
    if (NEGATIVE_WORDS.has(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  let sentiment: SentimentValue | null = null;
  let confidence = 0;

  if (total > 0) {
    const ratio = positiveCount / total;
    if (ratio > 0.7 && positiveCount >= 2) {
      sentiment = 'positive';
      confidence = Math.min(0.8, 0.5 + (positiveCount * 0.1));
    } else if (ratio < 0.3 && negativeCount >= 2) {
      sentiment = 'negative';
      confidence = Math.min(0.8, 0.5 + (negativeCount * 0.1));
    }
  }

  return {
    positiveCount,
    negativeCount,
    totalWords: words.length,
    sentiment,
    confidence,
  };
}

/**
 * Check for explicit slurs
 */
export function hasSlurs(text: string): { found: boolean; indicators: string[] } {
  const indicators: string[] = [];
  for (const pattern of SLUR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      indicators.push(`slur: ${match[0]}`);
    }
  }
  return { found: indicators.length > 0, indicators };
}

/**
 * Check for dehumanizing language
 */
export function hasDehumanization(text: string): { found: boolean; indicators: string[] } {
  const indicators: string[] = [];
  for (const pattern of DEHUMANIZATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      indicators.push(`dehumanization: ${match[0]}`);
    }
  }
  return { found: indicators.length > 0, indicators };
}

/**
 * Check for conspiracy language
 */
export function hasConspiracyLanguage(text: string): { found: boolean; indicators: string[] } {
  const indicators: string[] = [];
  for (const pattern of CONSPIRACY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      indicators.push(`conspiracy: ${match[0]}`);
    }
  }
  return { found: indicators.length > 0, indicators };
}

/**
 * Check for calls to violence or exclusion
 */
export function hasViolenceLanguage(text: string): { found: boolean; indicators: string[] } {
  const indicators: string[] = [];
  for (const pattern of VIOLENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      indicators.push(`violence/exclusion: ${match[0]}`);
    }
  }
  return { found: indicators.length > 0, indicators };
}

/**
 * Detect target group mentions
 */
export function detectTargetGroups(text: string, targetGroups: string[]): {
  found: boolean;
  groups: string[];
} {
  const foundGroups: string[] = [];

  for (const group of targetGroups) {
    const patterns = TARGET_GROUP_PATTERNS[group.toLowerCase()];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        foundGroups.push(group);
        break;
      }
    }
  }

  return {
    found: foundGroups.length > 0,
    groups: foundGroups,
  };
}

/**
 * Run Stage A heuristic analysis for sentiment
 */
export function runSentimentHeuristics(text: string): HeuristicResult {
  const indicators: string[] = [];

  // Check for very short/neutral text
  if (isLikelyNeutral(text)) {
    return {
      confident: true,
      suggestion: { sentiment: 'neutral' },
      reason: 'Text is too short or matches neutral patterns',
      indicators: ['neutral_pattern'],
    };
  }

  // Run lexicon analysis
  const lexiconResult = analyzeSentimentLexicon(text);

  if (lexiconResult.sentiment && lexiconResult.confidence >= 0.7) {
    indicators.push(`lexicon: ${lexiconResult.positiveCount}+ ${lexiconResult.negativeCount}-`);
    return {
      confident: true,
      suggestion: { sentiment: lexiconResult.sentiment },
      reason: `Strong lexicon signal (${lexiconResult.confidence.toFixed(2)} confidence)`,
      indicators,
    };
  }

  // Not confident enough for heuristics
  return {
    confident: false,
    suggestion: {},
    reason: 'Requires LLM analysis',
    indicators,
  };
}

/**
 * Run Stage A heuristic analysis for target group hostility
 */
export function runTargetGroupHeuristics(
  text: string,
  targetGroups: string[]
): HeuristicResult {
  const indicators: string[] = [];

  // Check for group mentions first
  const groupDetection = detectTargetGroups(text, targetGroups);
  if (!groupDetection.found) {
    return {
      confident: true,
      suggestion: { hasTargetGroupMention: false, hostilityLevel: 'none' },
      reason: 'No target group mention detected',
      indicators: ['no_group_mention'],
    };
  }

  indicators.push(`groups: ${groupDetection.groups.join(', ')}`);

  // Check for obvious hostility markers
  const slurs = hasSlurs(text);
  const dehumanization = hasDehumanization(text);
  const conspiracy = hasConspiracyLanguage(text);
  const violence = hasViolenceLanguage(text);

  if (slurs.found) indicators.push(...slurs.indicators);
  if (dehumanization.found) indicators.push(...dehumanization.indicators);
  if (conspiracy.found) indicators.push(...conspiracy.indicators);
  if (violence.found) indicators.push(...violence.indicators);

  // High confidence hostility detection
  if (slurs.found || violence.found) {
    return {
      confident: true,
      suggestion: { hasTargetGroupMention: true, hostilityLevel: 'high' },
      reason: 'Explicit slurs or violence language detected',
      indicators,
    };
  }

  if (dehumanization.found) {
    return {
      confident: true,
      suggestion: { hasTargetGroupMention: true, hostilityLevel: 'high' },
      reason: 'Dehumanizing language detected',
      indicators,
    };
  }

  // Medium confidence for conspiracy language
  if (conspiracy.found) {
    return {
      confident: false,  // Still needs LLM for nuance
      suggestion: { hasTargetGroupMention: true, hostilityLevel: 'medium' },
      reason: 'Potential conspiracy language - requires LLM verification',
      indicators,
    };
  }

  // Group mentioned but no obvious hostility - needs LLM
  return {
    confident: false,
    suggestion: { hasTargetGroupMention: true },
    reason: 'Group mentioned, hostility level unclear - requires LLM analysis',
    indicators,
  };
}

/**
 * Determine if a comment needs LLM analysis
 */
export function needsLLMAnalysis(
  sentimentResult: HeuristicResult,
  targetGroupResult: HeuristicResult | null
): boolean {
  if (!sentimentResult.confident) return true;
  if (targetGroupResult && !targetGroupResult.confident) return true;
  return false;
}

/**
 * Get all available target groups
 */
export function getAvailableTargetGroups(): string[] {
  return Object.keys(TARGET_GROUP_PATTERNS);
}
