/**
 * Prompt templates for sentiment and target group analysis
 * Implements versioned prompts with strict JSON output schemas
 */

import type { FrameworkType } from '@subreddit-bias/db';

// Prompt template interface
export interface PromptTemplate {
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: object;
}

// Comment input format for prompts
export interface CommentInput {
  id: string;
  body: string;
}

// Current prompt version
export const PROMPT_VERSION = '1.0.0';

/**
 * Sentiment analysis prompt template
 */
export const SENTIMENT_PROMPT: PromptTemplate = {
  version: PROMPT_VERSION,
  systemPrompt: `You are an expert sentiment analyst. Your task is to classify the sentiment of Reddit comments.

For each comment, provide:
1. sentiment: "positive", "neutral", or "negative"
2. subjectivity: A number from 0 (completely objective) to 1 (completely subjective)
3. confidence: A number from 0 to 1 indicating how confident you are in the classification

Guidelines:
- Focus on the overall emotional tone, not specific topics
- "neutral" includes informational, factual, or ambiguous content
- Consider sarcasm and context when possible
- Short responses like "yes", "ok", or links are typically neutral
- Be conservative with confidence - only use high values when very certain

Respond ONLY with a valid JSON array. No other text.`,

  userPromptTemplate: `Analyze the sentiment of these comments:

{{comments}}

Respond with a JSON array where each object has: id, sentiment, subjectivity, confidence`,

  outputSchema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
        subjectivity: { type: 'number', minimum: 0, maximum: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['id', 'sentiment', 'subjectivity', 'confidence'],
    },
  },
};

/**
 * Target group analysis prompt templates by framework
 */
export const TARGET_GROUP_PROMPTS: Record<FrameworkType, PromptTemplate> = {
  nexus: {
    version: PROMPT_VERSION,
    systemPrompt: `You are an expert content analyst specializing in detecting group-directed hostility using the Nexus Document framework.

The Nexus Document framework distinguishes between:
- Legitimate criticism of policies, governments, or public figures
- Hostility directed at ethnic, religious, or demographic groups as a whole

For each comment, determine:
1. mentions_group: Does the comment reference or mention the target group?
2. hostility_level: "none", "low", "medium", or "high"
3. labels: Array of applicable labels from:
   - slur_or_epithet: Use of derogatory terms
   - dehumanization: Comparing group to animals, vermin, disease
   - stereotype_or_trope: Invoking harmful stereotypes
   - conspiracy_claim: Alleging secret group control/coordination
   - collective_blame: Blaming entire group for actions of individuals
   - calls_for_exclusion_or_violence: Advocating harm or removal
   - denial_or_minimization: Denying historical persecution
4. confidence: 0-1 rating
5. rationale: Brief explanation (1-2 sentences)

Important guidelines:
- Quote context does not equal endorsement
- Criticism of specific policies/actions ≠ group hostility
- Consider whether a reasonable person from the group would feel targeted
- Be conservative - when uncertain, rate lower hostility

Respond ONLY with a valid JSON array. No other text.`,

    userPromptTemplate: `Analyze these comments for hostility indicators toward {{target_group}} using the Nexus Document framework:

{{comments}}

Respond with a JSON array where each object has: id, mentions_group, hostility_level, labels, confidence, rationale`,

    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          mentions_group: { type: 'boolean' },
          hostility_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
          labels: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
        },
        required: ['id', 'mentions_group', 'hostility_level', 'labels', 'confidence', 'rationale'],
      },
    },
  },

  jda: {
    version: PROMPT_VERSION,
    systemPrompt: `You are an expert content analyst specializing in detecting group-directed hostility using the Jerusalem Declaration on Antisemitism (JDA) framework.

The JDA framework emphasizes:
- Context and intent matter
- Criticism of Israel/Zionism is not inherently antisemitic
- Holding Jews collectively responsible for Israel's actions IS antisemitic
- Denying Jewish self-determination while supporting others' is discriminatory

For each comment, determine:
1. mentions_group: Does the comment reference or mention the target group?
2. hostility_level: "none", "low", "medium", or "high"
3. labels: Array of applicable labels from:
   - slur_or_epithet: Use of derogatory terms
   - dehumanization: Comparing group to animals, vermin, disease
   - stereotype_or_trope: Invoking harmful stereotypes
   - conspiracy_claim: Alleging secret group control/coordination
   - collective_blame: Blaming entire group for actions of individuals
   - calls_for_exclusion_or_violence: Advocating harm or removal
   - denial_or_minimization: Denying historical persecution
4. confidence: 0-1 rating
5. rationale: Brief explanation (1-2 sentences)

Important guidelines:
- Political speech about governments/policies has high protection
- Focus on whether the TARGET GROUP is being attacked, not policies
- Context of reclaimed language matters
- Be conservative - when uncertain, rate lower hostility

Respond ONLY with a valid JSON array. No other text.`,

    userPromptTemplate: `Analyze these comments for hostility indicators toward {{target_group}} using the JDA framework:

{{comments}}

Respond with a JSON array where each object has: id, mentions_group, hostility_level, labels, confidence, rationale`,

    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          mentions_group: { type: 'boolean' },
          hostility_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
          labels: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
        },
        required: ['id', 'mentions_group', 'hostility_level', 'labels', 'confidence', 'rationale'],
      },
    },
  },

  ihra: {
    version: PROMPT_VERSION,
    systemPrompt: `You are an expert content analyst specializing in detecting group-directed hostility using the IHRA Working Definition framework.

The IHRA framework includes examples like:
- Calling for violence against Jews
- Stereotypes about Jewish power/wealth/control
- Holding Jews collectively responsible for Israel
- Denying the Holocaust
- Comparing Israeli policy to Nazi policy
- Double standards for Israel compared to other democracies

For each comment, determine:
1. mentions_group: Does the comment reference or mention the target group?
2. hostility_level: "none", "low", "medium", or "high"
3. labels: Array of applicable labels from:
   - slur_or_epithet: Use of derogatory terms
   - dehumanization: Comparing group to animals, vermin, disease
   - stereotype_or_trope: Invoking harmful stereotypes
   - conspiracy_claim: Alleging secret group control/coordination
   - collective_blame: Blaming entire group for actions of individuals
   - calls_for_exclusion_or_violence: Advocating harm or removal
   - denial_or_minimization: Denying historical persecution
4. confidence: 0-1 rating
5. rationale: Brief explanation (1-2 sentences)

Important guidelines:
- The IHRA definition notes criticism of Israel similar to other countries is not antisemitic
- Context and overall pattern matter
- Focus on whether speech targets people based on group identity
- Be conservative - when uncertain, rate lower hostility

Respond ONLY with a valid JSON array. No other text.`,

    userPromptTemplate: `Analyze these comments for hostility indicators toward {{target_group}} using the IHRA framework:

{{comments}}

Respond with a JSON array where each object has: id, mentions_group, hostility_level, labels, confidence, rationale`,

    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          mentions_group: { type: 'boolean' },
          hostility_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
          labels: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
        },
        required: ['id', 'mentions_group', 'hostility_level', 'labels', 'confidence', 'rationale'],
      },
    },
  },
};

/**
 * Format comments for prompt
 */
export function formatCommentsForPrompt(comments: CommentInput[]): string {
  return comments
    .map((c, i) => `[${i + 1}] ID: ${c.id}\n${c.body}`)
    .join('\n\n---\n\n');
}

/**
 * Build sentiment analysis prompt
 */
export function buildSentimentPrompt(comments: CommentInput[]): {
  system: string;
  user: string;
} {
  const formattedComments = formatCommentsForPrompt(comments);
  return {
    system: SENTIMENT_PROMPT.systemPrompt,
    user: SENTIMENT_PROMPT.userPromptTemplate.replace('{{comments}}', formattedComments),
  };
}

/**
 * Build target group analysis prompt
 */
export function buildTargetGroupPrompt(
  comments: CommentInput[],
  targetGroup: string,
  framework: FrameworkType
): {
  system: string;
  user: string;
} {
  const template = TARGET_GROUP_PROMPTS[framework];
  const formattedComments = formatCommentsForPrompt(comments);

  return {
    system: template.systemPrompt,
    user: template.userPromptTemplate
      .replace('{{comments}}', formattedComments)
      .replace(/{{target_group}}/g, targetGroup),
  };
}

/**
 * Get prompt template by task type and framework
 */
export function getPromptTemplate(
  taskType: 'sentiment' | 'target_group',
  framework?: FrameworkType
): PromptTemplate {
  if (taskType === 'sentiment') {
    return SENTIMENT_PROMPT;
  }
  return TARGET_GROUP_PROMPTS[framework ?? 'nexus'];
}

/**
 * Validate prompt output against schema (basic validation)
 */
export function validatePromptOutput(output: unknown, schema: object): boolean {
  if (!output) return false;

  const schemaObj = schema as { type?: string; items?: { required?: string[] } };

  if (schemaObj.type === 'array') {
    if (!Array.isArray(output)) return false;

    const requiredFields = schemaObj.items?.required ?? [];
    for (const item of output) {
      if (typeof item !== 'object' || item === null) return false;
      for (const field of requiredFields) {
        if (!(field in item)) return false;
      }
    }
  }

  return true;
}
