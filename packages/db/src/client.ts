/**
 * Database client for Neon Postgres
 * Provides connection management and query execution
 */

import type {
  Report,
  Job,
  SampledComment,
  SentimentClassification,
  TargetGroupClassification,
  PromptTemplate,
  CacheEntry,
  Configuration,
  Schedule,
  CreateReport,
  CreateJob,
  CreateSampledComment,
  CreateCacheEntry,
  CreateSchedule,
  JobStatus,
  TaskType,
  FrameworkType,
  SentimentStats,
  TargetGroupStats,
} from './types';

// Database configuration
export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;
  maxConnections?: number;
}

// Query result type
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Mock database client for testing without actual DB connection
// In production, this would use @neondatabase/serverless or pg
export class DatabaseClient {
  private config: DatabaseConfig;
  private connected: boolean = false;

  // In-memory storage for testing
  private storage: {
    reports: Map<string, Report>;
    jobs: Map<string, Job>;
    sampledComments: Map<string, SampledComment>;
    sentimentClassifications: Map<string, SentimentClassification>;
    targetGroupClassifications: Map<string, TargetGroupClassification>;
    promptTemplates: Map<string, PromptTemplate>;
    cacheEntries: Map<string, CacheEntry>;
    configurations: Map<string, Configuration>;
    schedules: Map<string, Schedule>;
  };

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.storage = {
      reports: new Map(),
      jobs: new Map(),
      sampledComments: new Map(),
      sentimentClassifications: new Map(),
      targetGroupClassifications: new Map(),
      promptTemplates: new Map(),
      cacheEntries: new Map(),
      configurations: new Map(),
      schedules: new Map(),
    };
  }

  async connect(): Promise<void> {
    // In production, establish actual DB connection
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConfig(): DatabaseConfig {
    return this.config;
  }

  // Generate UUID
  private generateId(): string {
    return crypto.randomUUID();
  }

  // Reports
  async createReport(data: CreateReport): Promise<Report> {
    const report: Report = {
      id: this.generateId(),
      ...data,
      status: 'pending',
      communitySentiment: null,
      moderatorSentiment: null,
      targetGroupStats: [],
      sampledCommentCount: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    };
    this.storage.reports.set(report.id, report);
    return report;
  }

  async getReport(id: string): Promise<Report | null> {
    return this.storage.reports.get(id) ?? null;
  }

  async getReportsBySubreddit(subreddit: string): Promise<Report[]> {
    return Array.from(this.storage.reports.values())
      .filter(r => r.subreddit === subreddit)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentReports(limit: number = 10): Promise<Report[]> {
    return Array.from(this.storage.reports.values())
      .filter(r => r.status === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getAllReports(limit: number = 50): Promise<Report[]> {
    return Array.from(this.storage.reports.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateReportStatus(id: string, status: JobStatus, errorMessage?: string): Promise<Report | null> {
    const report = this.storage.reports.get(id);
    if (!report) return null;

    report.status = status;
    if (errorMessage) report.errorMessage = errorMessage;
    if (status === 'completed' || status === 'failed') {
      report.completedAt = new Date();
    }
    return report;
  }

  async updateReportStats(
    id: string,
    communitySentiment: SentimentStats | null,
    moderatorSentiment: SentimentStats | null,
    targetGroupStats: TargetGroupStats[],
    sampledCommentCount: number,
    totalTokensUsed: number,
    estimatedCost: number
  ): Promise<Report | null> {
    const report = this.storage.reports.get(id);
    if (!report) return null;

    report.communitySentiment = communitySentiment;
    report.moderatorSentiment = moderatorSentiment;
    report.targetGroupStats = targetGroupStats;
    report.sampledCommentCount = sampledCommentCount;
    report.totalTokensUsed = totalTokensUsed;
    report.estimatedCost = estimatedCost;
    return report;
  }

  // Jobs
  async createJob(data: CreateJob): Promise<Job> {
    const job: Job = {
      id: this.generateId(),
      ...data,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      retryCount: 0,
    };
    this.storage.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.storage.jobs.get(id) ?? null;
  }

  async getJobByReportId(reportId: string): Promise<Job | null> {
    return Array.from(this.storage.jobs.values())
      .find(j => j.reportId === reportId) ?? null;
  }

  async getAllJobs(limit: number = 50): Promise<Job[]> {
    return Array.from(this.storage.jobs.values())
      .sort((a, b) => {
        const aTime = a.startedAt?.getTime() ?? 0;
        const bTime = b.startedAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  async getActiveJobs(): Promise<Job[]> {
    return Array.from(this.storage.jobs.values())
      .filter(j => j.status === 'pending' || j.status === 'running')
      .sort((a, b) => {
        const aTime = a.startedAt?.getTime() ?? 0;
        const bTime = b.startedAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  async updateJobStatus(id: string, status: JobStatus, errorMessage?: string): Promise<Job | null> {
    const job = this.storage.jobs.get(id);
    if (!job) return null;

    job.status = status;
    if (errorMessage) job.errorMessage = errorMessage;
    if (status === 'running' && !job.startedAt) {
      job.startedAt = new Date();
    }
    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }
    return job;
  }

  async updateJobProgress(
    id: string,
    progress: number,
    currentPhase: string,
    tokensUsed: number,
    commentsProcessed: number
  ): Promise<Job | null> {
    const job = this.storage.jobs.get(id);
    if (!job) return null;

    job.progress = progress;
    job.currentPhase = currentPhase;
    job.tokensUsed = tokensUsed;
    job.commentsProcessed = commentsProcessed;
    return job;
  }

  // Sampled Comments
  async createSampledComment(data: CreateSampledComment): Promise<SampledComment> {
    const comment: SampledComment = {
      id: this.generateId(),
      ...data,
    };
    this.storage.sampledComments.set(comment.id, comment);
    return comment;
  }

  async createSampledComments(data: CreateSampledComment[]): Promise<SampledComment[]> {
    return Promise.all(data.map(d => this.createSampledComment(d)));
  }

  async getSampledCommentsByReportId(reportId: string): Promise<SampledComment[]> {
    return Array.from(this.storage.sampledComments.values())
      .filter(c => c.reportId === reportId);
  }

  async getSampledCommentsByReportIdAndModerator(reportId: string, isModerator: boolean): Promise<SampledComment[]> {
    return Array.from(this.storage.sampledComments.values())
      .filter(c => c.reportId === reportId && c.isModeratorComment === isModerator);
  }

  // Sentiment Classifications
  async createSentimentClassification(data: SentimentClassification): Promise<SentimentClassification> {
    this.storage.sentimentClassifications.set(data.commentId, data);
    return data;
  }

  async createSentimentClassifications(data: SentimentClassification[]): Promise<SentimentClassification[]> {
    data.forEach(d => this.storage.sentimentClassifications.set(d.commentId, d));
    return data;
  }

  async getSentimentClassificationsByCommentIds(commentIds: string[]): Promise<SentimentClassification[]> {
    return commentIds
      .map(id => this.storage.sentimentClassifications.get(id))
      .filter((c): c is SentimentClassification => c !== undefined);
  }

  // Target Group Classifications
  async createTargetGroupClassification(data: TargetGroupClassification): Promise<TargetGroupClassification> {
    const key = `${data.commentId}-${data.framework}-${data.targetGroup}`;
    this.storage.targetGroupClassifications.set(key, data);
    return data;
  }

  async createTargetGroupClassifications(data: TargetGroupClassification[]): Promise<TargetGroupClassification[]> {
    data.forEach(d => {
      const key = `${d.commentId}-${d.framework}-${d.targetGroup}`;
      this.storage.targetGroupClassifications.set(key, d);
    });
    return data;
  }

  async getTargetGroupClassificationsByCommentIds(
    commentIds: string[],
    framework?: FrameworkType
  ): Promise<TargetGroupClassification[]> {
    return Array.from(this.storage.targetGroupClassifications.values())
      .filter(c => commentIds.includes(c.commentId) && (!framework || c.framework === framework));
  }

  // Prompt Templates
  async getActivePromptTemplate(taskType: TaskType, framework?: FrameworkType): Promise<PromptTemplate | null> {
    return Array.from(this.storage.promptTemplates.values())
      .find(p => p.taskType === taskType && p.framework === (framework ?? null) && p.isActive) ?? null;
  }

  async createPromptTemplate(data: Omit<PromptTemplate, 'id' | 'createdAt'>): Promise<PromptTemplate> {
    const template: PromptTemplate = {
      id: this.generateId(),
      ...data,
      createdAt: new Date(),
    };
    this.storage.promptTemplates.set(template.id, template);
    return template;
  }

  // Cache Entries
  async getCacheEntry(
    commentId: string,
    editedUtc: number | null,
    taskType: TaskType,
    framework: FrameworkType | null,
    model: string,
    promptVersion: string
  ): Promise<CacheEntry | null> {
    const key = `${commentId}-${editedUtc}-${taskType}-${framework}-${model}-${promptVersion}`;
    const entry = this.storage.cacheEntries.get(key);
    if (entry && entry.expiresAt && entry.expiresAt < new Date()) {
      this.storage.cacheEntries.delete(key);
      return null;
    }
    return entry ?? null;
  }

  async createCacheEntry(data: CreateCacheEntry): Promise<CacheEntry> {
    const entry: CacheEntry = {
      id: this.generateId(),
      ...data,
      createdAt: new Date(),
    };
    const key = `${data.commentId}-${data.editedUtc}-${data.taskType}-${data.framework}-${data.model}-${data.promptVersion}`;
    this.storage.cacheEntries.set(key, entry);
    return entry;
  }

  // Configuration
  async getConfiguration(key: string): Promise<Configuration | null> {
    return this.storage.configurations.get(key) ?? null;
  }

  async setConfiguration(key: string, value: object): Promise<Configuration> {
    const existing = this.storage.configurations.get(key);
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      return existing;
    }

    const config: Configuration = {
      id: this.generateId(),
      key,
      value,
      updatedAt: new Date(),
    };
    this.storage.configurations.set(key, config);
    return config;
  }

  // Schedules
  async getActiveSchedules(): Promise<Schedule[]> {
    return Array.from(this.storage.schedules.values())
      .filter(s => s.isActive);
  }

  async getScheduleBySubreddit(subreddit: string): Promise<Schedule | null> {
    return Array.from(this.storage.schedules.values())
      .find(s => s.subreddit === subreddit) ?? null;
  }

  async createSchedule(data: CreateSchedule): Promise<Schedule> {
    const schedule: Schedule = {
      id: this.generateId(),
      ...data,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: new Date(),
    };
    this.storage.schedules.set(schedule.id, schedule);
    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule | null> {
    const schedule = this.storage.schedules.get(id);
    if (!schedule) return null;

    Object.assign(schedule, updates);
    return schedule;
  }

  // Utility methods for testing
  async clear(): Promise<void> {
    this.storage.reports.clear();
    this.storage.jobs.clear();
    this.storage.sampledComments.clear();
    this.storage.sentimentClassifications.clear();
    this.storage.targetGroupClassifications.clear();
    this.storage.promptTemplates.clear();
    this.storage.cacheEntries.clear();
    this.storage.configurations.clear();
    this.storage.schedules.clear();
  }

  // Get counts for testing
  getCounts(): Record<string, number> {
    return {
      reports: this.storage.reports.size,
      jobs: this.storage.jobs.size,
      sampledComments: this.storage.sampledComments.size,
      sentimentClassifications: this.storage.sentimentClassifications.size,
      targetGroupClassifications: this.storage.targetGroupClassifications.size,
      promptTemplates: this.storage.promptTemplates.size,
      cacheEntries: this.storage.cacheEntries.size,
      configurations: this.storage.configurations.size,
      schedules: this.storage.schedules.size,
    };
  }
}

// Singleton instance for in-memory development
let singletonClient: DatabaseClient | null = null;

// Factory function to create database client
export function createDatabaseClient(connectionString?: string): DatabaseClient {
  const connString = connectionString ?? process.env.DATABASE_URL ?? 'memory://';

  // Use singleton for in-memory storage to persist data across requests in dev
  if (connString === 'memory://') {
    if (!singletonClient) {
      singletonClient = new DatabaseClient({
        connectionString: connString,
        ssl: false,
        maxConnections: 10,
      });
    }
    return singletonClient;
  }

  // Create new client for real database connections
  return new DatabaseClient({
    connectionString: connString,
    ssl: true,
    maxConnections: 10,
  });
}

// Reset singleton for testing purposes
export function resetDatabaseClient(): void {
  singletonClient = null;
}
