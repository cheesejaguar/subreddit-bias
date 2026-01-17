/**
 * Neon Postgres Database Connection
 * Production database client using @neondatabase/serverless
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
} from './types.js';

// SQL query interface (compatible with @neondatabase/serverless)
export interface SqlQuery {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
}

/**
 * Neon Database Client
 * Uses parameterized queries for security
 */
export class NeonDatabaseClient {
  private sql: SqlQuery;

  constructor(sql: SqlQuery) {
    this.sql = sql;
  }

  // Reports
  async createReport(data: CreateReport): Promise<Report> {
    const [report] = await this.sql<Report>`
      INSERT INTO reports (subreddit, config, methodology_version, status)
      VALUES (${data.subreddit}, ${JSON.stringify(data.config)}, ${data.methodologyVersion}, 'pending')
      RETURNING *
    `;
    return this.mapReport(report);
  }

  async getReport(id: string): Promise<Report | null> {
    const [report] = await this.sql<Report>`
      SELECT * FROM reports WHERE id = ${id}
    `;
    return report ? this.mapReport(report) : null;
  }

  async getReportsBySubreddit(subreddit: string): Promise<Report[]> {
    const reports = await this.sql<Report>`
      SELECT * FROM reports
      WHERE subreddit = ${subreddit}
      ORDER BY created_at DESC
    `;
    return reports.map(r => this.mapReport(r));
  }

  async getRecentReports(limit: number = 10): Promise<Report[]> {
    const reports = await this.sql<Report>`
      SELECT * FROM reports
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return reports.map(r => this.mapReport(r));
  }

  async updateReportStatus(id: string, status: JobStatus, errorMessage?: string): Promise<Report | null> {
    const completedAt = status === 'completed' || status === 'failed' ? new Date() : null;

    const [report] = await this.sql<Report>`
      UPDATE reports
      SET status = ${status},
          error_message = ${errorMessage ?? null},
          completed_at = ${completedAt}
      WHERE id = ${id}
      RETURNING *
    `;
    return report ? this.mapReport(report) : null;
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
    const [report] = await this.sql<Report>`
      UPDATE reports
      SET community_sentiment = ${JSON.stringify(communitySentiment)},
          moderator_sentiment = ${JSON.stringify(moderatorSentiment)},
          target_group_stats = ${JSON.stringify(targetGroupStats)},
          sampled_comment_count = ${sampledCommentCount},
          total_tokens_used = ${totalTokensUsed},
          estimated_cost = ${estimatedCost}
      WHERE id = ${id}
      RETURNING *
    `;
    return report ? this.mapReport(report) : null;
  }

  // Jobs
  async createJob(data: CreateJob): Promise<Job> {
    const [job] = await this.sql<Job>`
      INSERT INTO jobs (
        report_id, status, progress, current_phase,
        tokens_used, comments_processed, comments_total, rate_limit_events
      )
      VALUES (
        ${data.reportId}, ${data.status}, ${data.progress}, ${data.currentPhase},
        ${data.tokensUsed}, ${data.commentsProcessed}, ${data.commentsTotal}, ${data.rateLimitEvents}
      )
      RETURNING *
    `;
    return this.mapJob(job);
  }

  async getJob(id: string): Promise<Job | null> {
    const [job] = await this.sql<Job>`
      SELECT * FROM jobs WHERE id = ${id}
    `;
    return job ? this.mapJob(job) : null;
  }

  async getJobByReportId(reportId: string): Promise<Job | null> {
    const [job] = await this.sql<Job>`
      SELECT * FROM jobs WHERE report_id = ${reportId}
    `;
    return job ? this.mapJob(job) : null;
  }

  async updateJobStatus(id: string, status: JobStatus, errorMessage?: string): Promise<Job | null> {
    let startedAt = null;
    let completedAt = null;

    if (status === 'running') {
      const [existing] = await this.sql<Job>`SELECT started_at FROM jobs WHERE id = ${id}`;
      if (!existing?.started_at) {
        startedAt = new Date();
      }
    }

    if (status === 'completed' || status === 'failed') {
      completedAt = new Date();
    }

    const [job] = await this.sql<Job>`
      UPDATE jobs
      SET status = ${status},
          error_message = COALESCE(${errorMessage}, error_message),
          started_at = COALESCE(${startedAt}, started_at),
          completed_at = COALESCE(${completedAt}, completed_at)
      WHERE id = ${id}
      RETURNING *
    `;
    return job ? this.mapJob(job) : null;
  }

  async updateJobProgress(
    id: string,
    progress: number,
    currentPhase: string,
    tokensUsed: number,
    commentsProcessed: number
  ): Promise<Job | null> {
    const [job] = await this.sql<Job>`
      UPDATE jobs
      SET progress = ${progress},
          current_phase = ${currentPhase},
          tokens_used = ${tokensUsed},
          comments_processed = ${commentsProcessed}
      WHERE id = ${id}
      RETURNING *
    `;
    return job ? this.mapJob(job) : null;
  }

  // Sampled Comments
  async createSampledComments(data: CreateSampledComment[]): Promise<SampledComment[]> {
    if (data.length === 0) return [];

    const values = data.map(d => `(
      '${d.reportId}', '${d.redditId}', '${d.postId}', ${d.parentId ? `'${d.parentId}'` : 'NULL'},
      '${d.subreddit}', '${d.permalink}', '${d.authorId}',
      ${d.createdUtc}, ${d.editedUtc ?? 'NULL'}, ${d.score}, ${d.depth},
      ${d.isModeratorComment}, '${d.samplingStrategy}'
    )`).join(',');

    const comments = await this.sql<SampledComment>`
      INSERT INTO sampled_comments (
        report_id, reddit_id, post_id, parent_id,
        subreddit, permalink, author_id,
        created_utc, edited_utc, score, depth,
        is_moderator_comment, sampling_strategy
      )
      VALUES ${values}
      RETURNING *
    `;
    return comments;
  }

  async getSampledCommentsByReportId(reportId: string): Promise<SampledComment[]> {
    return this.sql<SampledComment>`
      SELECT * FROM sampled_comments WHERE report_id = ${reportId}
    `;
  }

  // Sentiment Classifications
  async createSentimentClassifications(data: SentimentClassification[]): Promise<SentimentClassification[]> {
    if (data.length === 0) return [];

    const values = data.map(d => `(
      '${d.commentId}', '${d.sentiment}', ${d.subjectivity}, ${d.confidence},
      ${d.fromCache}, '${d.modelUsed}', '${d.promptVersion}'
    )`).join(',');

    return this.sql<SentimentClassification>`
      INSERT INTO sentiment_classifications (
        comment_id, sentiment, subjectivity, confidence,
        from_cache, model_used, prompt_version
      )
      VALUES ${values}
      ON CONFLICT (comment_id) DO UPDATE SET
        sentiment = EXCLUDED.sentiment,
        subjectivity = EXCLUDED.subjectivity,
        confidence = EXCLUDED.confidence
      RETURNING *
    `;
  }

  async getSentimentClassificationsByCommentIds(commentIds: string[]): Promise<SentimentClassification[]> {
    if (commentIds.length === 0) return [];

    return this.sql<SentimentClassification>`
      SELECT * FROM sentiment_classifications
      WHERE comment_id = ANY(${commentIds})
    `;
  }

  // Target Group Classifications
  async createTargetGroupClassifications(data: TargetGroupClassification[]): Promise<TargetGroupClassification[]> {
    if (data.length === 0) return [];

    const values = data.map(d => `(
      '${d.commentId}', '${d.framework}', ${d.mentionsGroup}, ${d.targetGroup ? `'${d.targetGroup}'` : 'NULL'},
      '${d.hostilityLevel}', ${JSON.stringify(d.labels)}, ${d.confidence},
      '${d.rationale}', ${d.fromCache}, '${d.modelUsed}', '${d.promptVersion}'
    )`).join(',');

    return this.sql<TargetGroupClassification>`
      INSERT INTO target_group_classifications (
        comment_id, framework, mentions_group, target_group,
        hostility_level, labels, confidence,
        rationale, from_cache, model_used, prompt_version
      )
      VALUES ${values}
      ON CONFLICT (comment_id, framework, target_group) DO UPDATE SET
        mentions_group = EXCLUDED.mentions_group,
        hostility_level = EXCLUDED.hostility_level,
        labels = EXCLUDED.labels,
        confidence = EXCLUDED.confidence,
        rationale = EXCLUDED.rationale
      RETURNING *
    `;
  }

  async getTargetGroupClassificationsByCommentIds(
    commentIds: string[],
    framework?: FrameworkType
  ): Promise<TargetGroupClassification[]> {
    if (commentIds.length === 0) return [];

    if (framework) {
      return this.sql<TargetGroupClassification>`
        SELECT * FROM target_group_classifications
        WHERE comment_id = ANY(${commentIds}) AND framework = ${framework}
      `;
    }

    return this.sql<TargetGroupClassification>`
      SELECT * FROM target_group_classifications
      WHERE comment_id = ANY(${commentIds})
    `;
  }

  // Prompt Templates
  async getActivePromptTemplate(taskType: TaskType, framework?: FrameworkType): Promise<PromptTemplate | null> {
    const [template] = await this.sql<PromptTemplate>`
      SELECT * FROM prompt_templates
      WHERE task_type = ${taskType}
        AND (framework = ${framework ?? null} OR framework IS NULL)
        AND is_active = true
      ORDER BY framework DESC NULLS LAST
      LIMIT 1
    `;
    return template ?? null;
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
    const [entry] = await this.sql<CacheEntry>`
      SELECT * FROM cache_entries
      WHERE comment_id = ${commentId}
        AND (edited_utc = ${editedUtc} OR (edited_utc IS NULL AND ${editedUtc} IS NULL))
        AND task_type = ${taskType}
        AND (framework = ${framework} OR (framework IS NULL AND ${framework} IS NULL))
        AND model = ${model}
        AND prompt_version = ${promptVersion}
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    return entry ?? null;
  }

  async createCacheEntry(data: CreateCacheEntry): Promise<CacheEntry> {
    const [entry] = await this.sql<CacheEntry>`
      INSERT INTO cache_entries (
        comment_id, edited_utc, task_type, framework,
        model, prompt_version, result, expires_at
      )
      VALUES (
        ${data.commentId}, ${data.editedUtc}, ${data.taskType}, ${data.framework},
        ${data.model}, ${data.promptVersion}, ${JSON.stringify(data.result)}, ${data.expiresAt}
      )
      ON CONFLICT (comment_id, edited_utc, task_type, framework, model, prompt_version)
      DO UPDATE SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at
      RETURNING *
    `;
    return entry;
  }

  // Configuration
  async getConfiguration(key: string): Promise<Configuration | null> {
    const [config] = await this.sql<Configuration>`
      SELECT * FROM configurations WHERE key = ${key}
    `;
    return config ?? null;
  }

  async setConfiguration(key: string, value: object): Promise<Configuration> {
    const [config] = await this.sql<Configuration>`
      INSERT INTO configurations (key, value)
      VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      RETURNING *
    `;
    return config;
  }

  // Schedules
  async getActiveSchedules(): Promise<Schedule[]> {
    return this.sql<Schedule>`
      SELECT * FROM schedules WHERE is_active = true
    `;
  }

  async getScheduleBySubreddit(subreddit: string): Promise<Schedule | null> {
    const [schedule] = await this.sql<Schedule>`
      SELECT * FROM schedules WHERE subreddit = ${subreddit}
    `;
    return schedule ?? null;
  }

  async createSchedule(data: CreateSchedule): Promise<Schedule> {
    const [schedule] = await this.sql<Schedule>`
      INSERT INTO schedules (subreddit, cron_expression, config, is_active)
      VALUES (${data.subreddit}, ${data.cronExpression}, ${JSON.stringify(data.config)}, ${data.isActive})
      RETURNING *
    `;
    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<Schedule>): Promise<Schedule | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.isActive !== undefined) {
      fields.push('is_active = $' + (values.length + 1));
      values.push(updates.isActive);
    }
    if (updates.lastRunAt !== undefined) {
      fields.push('last_run_at = $' + (values.length + 1));
      values.push(updates.lastRunAt);
    }
    if (updates.nextRunAt !== undefined) {
      fields.push('next_run_at = $' + (values.length + 1));
      values.push(updates.nextRunAt);
    }

    if (fields.length === 0) return this.getScheduleById(id);

    const [schedule] = await this.sql<Schedule>`
      UPDATE schedules
      SET ${fields.join(', ')}
      WHERE id = ${id}
      RETURNING *
    `;
    return schedule ?? null;
  }

  private async getScheduleById(id: string): Promise<Schedule | null> {
    const [schedule] = await this.sql<Schedule>`
      SELECT * FROM schedules WHERE id = ${id}
    `;
    return schedule ?? null;
  }

  // Data purge
  async purgeExpiredCacheEntries(): Promise<number> {
    const result = await this.sql`
      DELETE FROM cache_entries WHERE expires_at < NOW()
    `;
    return (result as unknown as { count: number }).count ?? 0;
  }

  async purgeOldReports(olderThan: Date): Promise<number> {
    const result = await this.sql`
      DELETE FROM reports WHERE created_at < ${olderThan}
    `;
    return (result as unknown as { count: number }).count ?? 0;
  }

  // Map snake_case to camelCase
  private mapReport(row: Record<string, unknown>): Report {
    return {
      id: row.id as string,
      subreddit: row.subreddit as string,
      config: (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) as Report['config'],
      methodologyVersion: (row.methodology_version ?? row.methodologyVersion) as string,
      status: row.status as JobStatus,
      communitySentiment: row.community_sentiment as SentimentStats | null,
      moderatorSentiment: row.moderator_sentiment as SentimentStats | null,
      targetGroupStats: (row.target_group_stats ?? []) as TargetGroupStats[],
      sampledCommentCount: (row.sampled_comment_count ?? 0) as number,
      totalTokensUsed: (row.total_tokens_used ?? 0) as number,
      estimatedCost: (row.estimated_cost ?? 0) as number,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      errorMessage: row.error_message as string | null,
    };
  }

  private mapJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      reportId: (row.report_id ?? row.reportId) as string,
      status: row.status as JobStatus,
      progress: row.progress as number,
      currentPhase: (row.current_phase ?? row.currentPhase) as string,
      tokensUsed: (row.tokens_used ?? row.tokensUsed) as number,
      commentsProcessed: (row.comments_processed ?? row.commentsProcessed) as number,
      commentsTotal: (row.comments_total ?? row.commentsTotal) as number,
      rateLimitEvents: (row.rate_limit_events ?? row.rateLimitEvents) as number,
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      errorMessage: row.error_message as string | null,
      retryCount: (row.retry_count ?? 0) as number,
    };
  }
}

/**
 * Create a Neon database client
 * In production, pass the sql tagged template from @neondatabase/serverless
 *
 * Usage:
 * ```ts
 * import { neon } from '@neondatabase/serverless';
 * const sql = neon(process.env.DATABASE_URL);
 * const db = createNeonClient(sql);
 * ```
 */
export function createNeonClient(sql: SqlQuery): NeonDatabaseClient {
  return new NeonDatabaseClient(sql);
}
