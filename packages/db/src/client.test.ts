import { describe, test, expect, beforeEach } from 'bun:test';
import { DatabaseClient, createDatabaseClient } from './client';
import type { CreateReport, ReportConfig, SamplingConfig } from './types';

describe('DatabaseClient', () => {
  let db: DatabaseClient;

  const createTestSamplingConfig = (): SamplingConfig => ({
    strategies: ['top', 'new'],
    postsPerStrategy: 25,
    commentsPerPost: 50,
    maxDepth: 2,
    seed: 12345,
  });

  const createTestReportConfig = (): ReportConfig => ({
    subreddit: 'test_subreddit',
    timeframeStart: new Date('2024-01-01'),
    timeframeEnd: new Date('2024-01-07'),
    sampling: createTestSamplingConfig(),
    frameworks: ['nexus', 'jda'],
    enableTargetGroupAnalysis: true,
    targetGroups: ['jewish'],
    peerSubreddits: ['news', 'worldnews'],
    methodologyVersion: '1.0.0',
  });

  beforeEach(() => {
    db = createDatabaseClient('memory://');
  });

  describe('connection', () => {
    test('can connect', async () => {
      expect(db.isConnected()).toBe(false);
      await db.connect();
      expect(db.isConnected()).toBe(true);
    });

    test('can disconnect', async () => {
      await db.connect();
      expect(db.isConnected()).toBe(true);
      await db.disconnect();
      expect(db.isConnected()).toBe(false);
    });

    test('returns config', () => {
      const config = db.getConfig();
      expect(config.connectionString).toBe('memory://');
    });
  });

  describe('reports', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create a report', async () => {
      const reportData: CreateReport = {
        subreddit: 'test_subreddit',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      };

      const report = await db.createReport(reportData);

      expect(report.id).toBeDefined();
      expect(report.subreddit).toBe('test_subreddit');
      expect(report.status).toBe('pending');
      expect(report.communitySentiment).toBeNull();
      expect(report.moderatorSentiment).toBeNull();
      expect(report.targetGroupStats).toEqual([]);
      expect(report.sampledCommentCount).toBe(0);
      expect(report.totalTokensUsed).toBe(0);
      expect(report.estimatedCost).toBe(0);
      expect(report.createdAt).toBeInstanceOf(Date);
      expect(report.completedAt).toBeNull();
      expect(report.errorMessage).toBeNull();
    });

    test('can get a report by id', async () => {
      const reportData: CreateReport = {
        subreddit: 'test_subreddit',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      };

      const created = await db.createReport(reportData);
      const retrieved = await db.getReport(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.subreddit).toBe('test_subreddit');
    });

    test('returns null for non-existent report', async () => {
      const report = await db.getReport('non-existent-id');
      expect(report).toBeNull();
    });

    test('can get reports by subreddit', async () => {
      await db.createReport({
        subreddit: 'subreddit_a',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });
      await db.createReport({
        subreddit: 'subreddit_b',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });
      await db.createReport({
        subreddit: 'subreddit_a',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const reportsA = await db.getReportsBySubreddit('subreddit_a');
      const reportsB = await db.getReportsBySubreddit('subreddit_b');

      expect(reportsA).toHaveLength(2);
      expect(reportsB).toHaveLength(1);
    });

    test('can update report status', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const updated = await db.updateReportStatus(report.id, 'running');
      expect(updated?.status).toBe('running');

      const completed = await db.updateReportStatus(report.id, 'completed');
      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    test('can update report status with error message', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const updated = await db.updateReportStatus(report.id, 'failed', 'Test error');
      expect(updated?.status).toBe('failed');
      expect(updated?.errorMessage).toBe('Test error');
    });

    test('can update report stats', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const sentimentStats = {
        distribution: { positive: 10, neutral: 20, negative: 5, total: 35 },
        avgSubjectivity: 0.5,
        avgConfidence: 0.85,
        sampleSize: 35,
      };

      const updated = await db.updateReportStats(
        report.id,
        sentimentStats,
        null,
        [],
        100,
        5000,
        0.05
      );

      expect(updated?.communitySentiment).toEqual(sentimentStats);
      expect(updated?.sampledCommentCount).toBe(100);
      expect(updated?.totalTokensUsed).toBe(5000);
      expect(updated?.estimatedCost).toBe(0.05);
    });

    test('can get recent completed reports', async () => {
      const report1 = await db.createReport({
        subreddit: 'test1',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });
      await db.createReport({
        subreddit: 'test2',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      await db.updateReportStatus(report1.id, 'completed');

      const recent = await db.getRecentReports(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].subreddit).toBe('test1');
    });
  });

  describe('jobs', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create a job', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const job = await db.createJob({
        reportId: report.id,
        status: 'pending',
        progress: 0,
        currentPhase: 'Initializing',
        tokensUsed: 0,
        commentsProcessed: 0,
        commentsTotal: 100,
        rateLimitEvents: 0,
      });

      expect(job.id).toBeDefined();
      expect(job.reportId).toBe(report.id);
      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);
      expect(job.retryCount).toBe(0);
    });

    test('can get job by report id', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      await db.createJob({
        reportId: report.id,
        status: 'pending',
        progress: 0,
        currentPhase: 'Initializing',
        tokensUsed: 0,
        commentsProcessed: 0,
        commentsTotal: 100,
        rateLimitEvents: 0,
      });

      const job = await db.getJobByReportId(report.id);
      expect(job).not.toBeNull();
      expect(job?.reportId).toBe(report.id);
    });

    test('can update job status', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const job = await db.createJob({
        reportId: report.id,
        status: 'pending',
        progress: 0,
        currentPhase: 'Initializing',
        tokensUsed: 0,
        commentsProcessed: 0,
        commentsTotal: 100,
        rateLimitEvents: 0,
      });

      const running = await db.updateJobStatus(job.id, 'running');
      expect(running?.status).toBe('running');
      expect(running?.startedAt).toBeInstanceOf(Date);

      const completed = await db.updateJobStatus(job.id, 'completed');
      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeInstanceOf(Date);
    });

    test('can update job progress', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const job = await db.createJob({
        reportId: report.id,
        status: 'running',
        progress: 0,
        currentPhase: 'Initializing',
        tokensUsed: 0,
        commentsProcessed: 0,
        commentsTotal: 100,
        rateLimitEvents: 0,
      });

      const updated = await db.updateJobProgress(job.id, 50, 'Processing', 2500, 50);
      expect(updated?.progress).toBe(50);
      expect(updated?.currentPhase).toBe('Processing');
      expect(updated?.tokensUsed).toBe(2500);
      expect(updated?.commentsProcessed).toBe(50);
    });
  });

  describe('sampled comments', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create sampled comments', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const comments = await db.createSampledComments([
        {
          redditId: 'abc123',
          subreddit: 'test',
          postId: 'post1',
          permalink: '/r/test/comments/post1/abc123',
          authorId: 'user1',
          isModeratorComment: false,
          createdUtc: Date.now() / 1000,
          editedUtc: null,
          depth: 1,
          samplingStrategy: 'top',
          reportId: report.id,
        },
        {
          redditId: 'def456',
          subreddit: 'test',
          postId: 'post1',
          permalink: '/r/test/comments/post1/def456',
          authorId: 'mod1',
          isModeratorComment: true,
          createdUtc: Date.now() / 1000,
          editedUtc: null,
          depth: 2,
          samplingStrategy: 'top',
          reportId: report.id,
        },
      ]);

      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBeDefined();
      expect(comments[1].isModeratorComment).toBe(true);
    });

    test('can get comments by report and moderator status', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      await db.createSampledComments([
        {
          redditId: 'abc123',
          subreddit: 'test',
          postId: 'post1',
          permalink: '/r/test/comments/post1/abc123',
          authorId: 'user1',
          isModeratorComment: false,
          createdUtc: Date.now() / 1000,
          editedUtc: null,
          depth: 1,
          samplingStrategy: 'top',
          reportId: report.id,
        },
        {
          redditId: 'def456',
          subreddit: 'test',
          postId: 'post1',
          permalink: '/r/test/comments/post1/def456',
          authorId: 'mod1',
          isModeratorComment: true,
          createdUtc: Date.now() / 1000,
          editedUtc: null,
          depth: 2,
          samplingStrategy: 'top',
          reportId: report.id,
        },
      ]);

      const regularComments = await db.getSampledCommentsByReportIdAndModerator(report.id, false);
      const modComments = await db.getSampledCommentsByReportIdAndModerator(report.id, true);

      expect(regularComments).toHaveLength(1);
      expect(modComments).toHaveLength(1);
    });
  });

  describe('configurations', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can set and get configuration', async () => {
      await db.setConfiguration('test_key', { value: 123, nested: { a: 'b' } });

      const config = await db.getConfiguration('test_key');
      expect(config).not.toBeNull();
      expect(config?.value).toEqual({ value: 123, nested: { a: 'b' } });
    });

    test('can update existing configuration', async () => {
      await db.setConfiguration('test_key', { value: 1 });
      await db.setConfiguration('test_key', { value: 2 });

      const config = await db.getConfiguration('test_key');
      expect(config?.value).toEqual({ value: 2 });
    });

    test('returns null for non-existent configuration', async () => {
      const config = await db.getConfiguration('non_existent');
      expect(config).toBeNull();
    });
  });

  describe('schedules', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create a schedule', async () => {
      const schedule = await db.createSchedule({
        subreddit: 'test',
        cronExpression: '0 0 * * *',
        config: {
          sampling: createTestSamplingConfig(),
          frameworks: ['nexus'],
          enableTargetGroupAnalysis: false,
          targetGroups: [],
          peerSubreddits: [],
          methodologyVersion: '1.0.0',
        },
        isActive: true,
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.subreddit).toBe('test');
      expect(schedule.isActive).toBe(true);
    });

    test('can get active schedules', async () => {
      await db.createSchedule({
        subreddit: 'test1',
        cronExpression: '0 0 * * *',
        config: {} as any,
        isActive: true,
      });
      await db.createSchedule({
        subreddit: 'test2',
        cronExpression: '0 0 * * *',
        config: {} as any,
        isActive: false,
      });

      const active = await db.getActiveSchedules();
      expect(active).toHaveLength(1);
      expect(active[0].subreddit).toBe('test1');
    });
  });

  describe('cache entries', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create and get cache entry', async () => {
      await db.createCacheEntry({
        commentId: 'comment1',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'openai/gpt-4o-mini',
        promptVersion: '1.0.0',
        response: { sentiment: 'positive' },
        tokensUsed: 100,
        expiresAt: null,
      });

      const entry = await db.getCacheEntry(
        'comment1',
        null,
        'sentiment',
        null,
        'openai/gpt-4o-mini',
        '1.0.0'
      );

      expect(entry).not.toBeNull();
      expect(entry?.response).toEqual({ sentiment: 'positive' });
    });

    test('returns null for expired cache entry', async () => {
      await db.createCacheEntry({
        commentId: 'comment1',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'openai/gpt-4o-mini',
        promptVersion: '1.0.0',
        response: { sentiment: 'positive' },
        tokensUsed: 100,
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      const entry = await db.getCacheEntry(
        'comment1',
        null,
        'sentiment',
        null,
        'openai/gpt-4o-mini',
        '1.0.0'
      );

      expect(entry).toBeNull();
    });

    test('returns null for non-existent cache entry', async () => {
      const entry = await db.getCacheEntry(
        'non-existent',
        null,
        'sentiment',
        null,
        'model',
        '1.0.0'
      );
      expect(entry).toBeNull();
    });
  });

  describe('sentiment classifications', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create and retrieve sentiment classifications', async () => {
      const classification = {
        commentId: 'c1',
        sentiment: 'positive' as const,
        subjectivity: 0.5,
        confidence: 0.8,
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      };

      await db.createSentimentClassification(classification);
      const results = await db.getSentimentClassificationsByCommentIds(['c1', 'c2']);

      expect(results).toHaveLength(1);
      expect(results[0].commentId).toBe('c1');
    });

    test('can create multiple sentiment classifications', async () => {
      const classifications = [
        { commentId: 'c1', sentiment: 'positive' as const, subjectivity: 0.5, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
        { commentId: 'c2', sentiment: 'negative' as const, subjectivity: 0.6, confidence: 0.7, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      ];

      await db.createSentimentClassifications(classifications);
      const results = await db.getSentimentClassificationsByCommentIds(['c1', 'c2']);

      expect(results).toHaveLength(2);
    });
  });

  describe('target group classifications', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create and retrieve target group classifications', async () => {
      const classification = {
        commentId: 'c1',
        framework: 'nexus' as const,
        mentionsGroup: true,
        targetGroup: 'jewish',
        hostilityLevel: 'low' as const,
        labels: ['stereotype_or_trope'] as const,
        confidence: 0.8,
        rationale: 'Test',
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      };

      await db.createTargetGroupClassification(classification);
      const results = await db.getTargetGroupClassificationsByCommentIds(['c1']);

      expect(results).toHaveLength(1);
      expect(results[0].targetGroup).toBe('jewish');
    });

    test('can create multiple target group classifications', async () => {
      const classifications = [
        { commentId: 'c1', framework: 'nexus' as const, mentionsGroup: true, targetGroup: 'jewish', hostilityLevel: 'none' as const, labels: [] as any, confidence: 0.8, rationale: '', fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
        { commentId: 'c2', framework: 'nexus' as const, mentionsGroup: false, targetGroup: 'jewish', hostilityLevel: 'none' as const, labels: [] as any, confidence: 0.9, rationale: '', fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      ];

      await db.createTargetGroupClassifications(classifications);
      const results = await db.getTargetGroupClassificationsByCommentIds(['c1', 'c2'], 'nexus');

      expect(results).toHaveLength(2);
    });

    test('filters by framework', async () => {
      const classifications = [
        { commentId: 'c1', framework: 'nexus' as const, mentionsGroup: true, targetGroup: 'jewish', hostilityLevel: 'none' as const, labels: [] as any, confidence: 0.8, rationale: '', fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
        { commentId: 'c1', framework: 'jda' as const, mentionsGroup: true, targetGroup: 'jewish', hostilityLevel: 'none' as const, labels: [] as any, confidence: 0.8, rationale: '', fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      ];

      await db.createTargetGroupClassifications(classifications);

      const nexusResults = await db.getTargetGroupClassificationsByCommentIds(['c1'], 'nexus');
      const jdaResults = await db.getTargetGroupClassificationsByCommentIds(['c1'], 'jda');
      const allResults = await db.getTargetGroupClassificationsByCommentIds(['c1']);

      expect(nexusResults).toHaveLength(1);
      expect(jdaResults).toHaveLength(1);
      expect(allResults).toHaveLength(2);
    });
  });

  describe('prompt templates', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can create and get active prompt template', async () => {
      await db.createPromptTemplate({
        version: '1.0.0',
        taskType: 'sentiment',
        framework: null,
        template: 'Test template',
        outputSchema: {},
        isActive: true,
      });

      const template = await db.getActivePromptTemplate('sentiment');
      expect(template).not.toBeNull();
      expect(template?.template).toBe('Test template');
    });

    test('returns null for non-existent template', async () => {
      const template = await db.getActivePromptTemplate('sentiment', 'nexus');
      expect(template).toBeNull();
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await db.connect();
    });

    test('can clear all data', async () => {
      await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      const countsBefore = db.getCounts();
      expect(countsBefore.reports).toBe(1);

      await db.clear();

      const countsAfter = db.getCounts();
      expect(countsAfter.reports).toBe(0);
    });

    test('getCounts returns accurate counts', async () => {
      const report = await db.createReport({
        subreddit: 'test',
        config: createTestReportConfig(),
        methodologyVersion: '1.0.0',
      });

      await db.createJob({
        reportId: report.id,
        status: 'pending',
        progress: 0,
        currentPhase: 'Init',
        tokensUsed: 0,
        commentsProcessed: 0,
        commentsTotal: 0,
        rateLimitEvents: 0,
      });

      const counts = db.getCounts();
      expect(counts.reports).toBe(1);
      expect(counts.jobs).toBe(1);
    });
  });
});
