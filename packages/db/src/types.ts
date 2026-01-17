/**
 * Database types for the Subreddit Sentiment & Bias Signals Analyzer
 */

// Enums
export type SentimentValue = 'positive' | 'neutral' | 'negative';
export type HostilityLevel = 'none' | 'low' | 'medium' | 'high';
export type FrameworkType = 'ihra' | 'jda' | 'nexus';
export type SamplingStrategy = 'top' | 'new' | 'controversial';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'sentiment' | 'target_group';

// Target group hostility labels
export type HostilityLabel =
  | 'slur_or_epithet'
  | 'dehumanization'
  | 'stereotype_or_trope'
  | 'conspiracy_claim'
  | 'collective_blame'
  | 'calls_for_exclusion_or_violence'
  | 'denial_or_minimization';

export const HOSTILITY_LABELS: readonly HostilityLabel[] = [
  'slur_or_epithet',
  'dehumanization',
  'stereotype_or_trope',
  'conspiracy_claim',
  'collective_blame',
  'calls_for_exclusion_or_violence',
  'denial_or_minimization',
] as const;

// Methodology version type
export interface MethodologyVersion {
  version: string;
  sentimentPromptVersion: string;
  targetGroupPromptVersion: string;
  samplingAlgorithmVersion: string;
  baselineSubreddits: string[];
  createdAt: Date;
}

// Sampling configuration
export interface SamplingConfig {
  strategies: SamplingStrategy[];
  postsPerStrategy: number;
  commentsPerPost: number;
  maxDepth: number;
  seed: number;
}

// Report configuration
export interface ReportConfig {
  subreddit: string;
  timeframeStart: Date;
  timeframeEnd: Date;
  sampling: SamplingConfig;
  frameworks: FrameworkType[];
  enableTargetGroupAnalysis: boolean;
  targetGroups: string[];
  peerSubreddits: string[];
  methodologyVersion: string;
}

// Comment classification result
export interface SentimentClassification {
  commentId: string;
  sentiment: SentimentValue;
  subjectivity: number; // 0-1
  confidence: number; // 0-1
  fromCache: boolean;
  modelUsed: string;
  promptVersion: string;
}

// Target group classification result
export interface TargetGroupClassification {
  commentId: string;
  framework: FrameworkType;
  mentionsGroup: boolean;
  targetGroup: string;
  hostilityLevel: HostilityLevel;
  labels: HostilityLabel[];
  confidence: number; // 0-1
  rationale: string;
  fromCache: boolean;
  modelUsed: string;
  promptVersion: string;
}

// Sampled comment record (no body stored)
export interface SampledComment {
  id: string;
  redditId: string;
  subreddit: string;
  postId: string;
  permalink: string;
  authorId: string | null;
  isModeratorComment: boolean;
  createdUtc: number;
  editedUtc: number | null;
  depth: number;
  samplingStrategy: SamplingStrategy;
  reportId: string;
}

// Aggregate sentiment statistics
export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface SentimentStats {
  distribution: SentimentDistribution;
  avgSubjectivity: number;
  avgConfidence: number;
  sampleSize: number;
}

// Aggregate target group statistics
export interface TargetGroupStats {
  framework: FrameworkType;
  targetGroup: string;
  totalMentions: number;
  hostilityDistribution: Record<HostilityLevel, number>;
  labelCounts: Record<HostilityLabel, number>;
  prevalenceRate: number; // mentions with any hostility / total
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  avgConfidence: number;
  sampleSize: number;
}

// Report entity
export interface Report {
  id: string;
  subreddit: string;
  config: ReportConfig;
  status: JobStatus;
  communitySentiment: SentimentStats | null;
  moderatorSentiment: SentimentStats | null;
  targetGroupStats: TargetGroupStats[];
  sampledCommentCount: number;
  totalTokensUsed: number;
  estimatedCost: number;
  methodologyVersion: string;
  createdAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

// Job entity for tracking scan progress
export interface Job {
  id: string;
  reportId: string;
  status: JobStatus;
  progress: number; // 0-100
  currentPhase: string;
  tokensUsed: number;
  commentsProcessed: number;
  commentsTotal: number;
  rateLimitEvents: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

// Prompt template for versioning
export interface PromptTemplate {
  id: string;
  version: string;
  taskType: TaskType;
  framework: FrameworkType | null;
  template: string;
  outputSchema: object;
  createdAt: Date;
  isActive: boolean;
}

// Cache entry for LLM responses
export interface CacheEntry {
  id: string;
  commentId: string;
  editedUtc: number | null;
  taskType: TaskType;
  framework: FrameworkType | null;
  model: string;
  promptVersion: string;
  response: object;
  tokensUsed: number;
  createdAt: Date;
  expiresAt: Date | null;
}

// Configuration entity for admin
export interface Configuration {
  id: string;
  key: string;
  value: object;
  updatedAt: Date;
}

// Rate limit tracking
export interface RateLimitEvent {
  id: string;
  jobId: string;
  provider: string;
  limitType: string;
  retryAfter: number;
  occurredAt: Date;
}

// Schedule for automated scans
export interface Schedule {
  id: string;
  subreddit: string;
  cronExpression: string;
  config: Omit<ReportConfig, 'subreddit' | 'timeframeStart' | 'timeframeEnd'>;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
}

// Helper type for creating new records
export type CreateReport = Omit<Report, 'id' | 'createdAt' | 'completedAt' | 'status' | 'communitySentiment' | 'moderatorSentiment' | 'targetGroupStats' | 'sampledCommentCount' | 'totalTokensUsed' | 'estimatedCost' | 'errorMessage'>;
export type CreateJob = Omit<Job, 'id' | 'startedAt' | 'completedAt' | 'errorMessage' | 'retryCount'>;
export type CreateSampledComment = Omit<SampledComment, 'id'>;
export type CreateCacheEntry = Omit<CacheEntry, 'id' | 'createdAt'>;
export type CreateSchedule = Omit<Schedule, 'id' | 'lastRunAt' | 'nextRunAt' | 'createdAt'>;

// Validation helpers
export function isValidSentiment(value: string): value is SentimentValue {
  return ['positive', 'neutral', 'negative'].includes(value);
}

export function isValidHostilityLevel(value: string): value is HostilityLevel {
  return ['none', 'low', 'medium', 'high'].includes(value);
}

export function isValidFramework(value: string): value is FrameworkType {
  return ['ihra', 'jda', 'nexus'].includes(value);
}

export function isValidSamplingStrategy(value: string): value is SamplingStrategy {
  return ['top', 'new', 'controversial'].includes(value);
}

export function isValidJobStatus(value: string): value is JobStatus {
  return ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(value);
}

export function isValidTaskType(value: string): value is TaskType {
  return ['sentiment', 'target_group'].includes(value);
}

export function isValidHostilityLabel(value: string): value is HostilityLabel {
  return HOSTILITY_LABELS.includes(value as HostilityLabel);
}
