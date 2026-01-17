/**
 * Database schema definitions for SQL migrations
 * These are the SQL statements to create the necessary tables
 */

export const SCHEMA_VERSION = '0.1.0';

export const CREATE_TABLES_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE sentiment_value AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE hostility_level AS ENUM ('none', 'low', 'medium', 'high');
CREATE TYPE framework_type AS ENUM ('ihra', 'jda', 'nexus');
CREATE TYPE sampling_strategy AS ENUM ('top', 'new', 'controversial');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE task_type AS ENUM ('sentiment', 'target_group');

-- Methodology versions table
CREATE TABLE IF NOT EXISTS methodology_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(20) NOT NULL UNIQUE,
  sentiment_prompt_version VARCHAR(20) NOT NULL,
  target_group_prompt_version VARCHAR(20) NOT NULL,
  sampling_algorithm_version VARCHAR(20) NOT NULL,
  baseline_subreddits JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subreddit VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  community_sentiment JSONB,
  moderator_sentiment JSONB,
  target_group_stats JSONB DEFAULT '[]',
  sampled_comment_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  estimated_cost DECIMAL(10, 6) DEFAULT 0,
  methodology_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  CONSTRAINT fk_methodology_version FOREIGN KEY (methodology_version)
    REFERENCES methodology_versions(version)
);

-- Jobs table for tracking scan progress
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_phase VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  comments_processed INTEGER DEFAULT 0,
  comments_total INTEGER DEFAULT 0,
  rate_limit_events INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Sampled comments table (no body stored for privacy)
CREATE TABLE IF NOT EXISTS sampled_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reddit_id VARCHAR(20) NOT NULL,
  subreddit VARCHAR(255) NOT NULL,
  post_id VARCHAR(20) NOT NULL,
  permalink TEXT NOT NULL,
  author_id VARCHAR(50),
  is_moderator_comment BOOLEAN DEFAULT FALSE,
  created_utc BIGINT NOT NULL,
  edited_utc BIGINT,
  depth INTEGER NOT NULL,
  sampling_strategy sampling_strategy NOT NULL,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  UNIQUE(reddit_id, report_id)
);

-- Sentiment classifications table
CREATE TABLE IF NOT EXISTS sentiment_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES sampled_comments(id) ON DELETE CASCADE,
  sentiment sentiment_value NOT NULL,
  subjectivity DECIMAL(4, 3) NOT NULL CHECK (subjectivity >= 0 AND subjectivity <= 1),
  confidence DECIMAL(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  from_cache BOOLEAN DEFAULT FALSE,
  model_used VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id)
);

-- Target group classifications table
CREATE TABLE IF NOT EXISTS target_group_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES sampled_comments(id) ON DELETE CASCADE,
  framework framework_type NOT NULL,
  mentions_group BOOLEAN NOT NULL,
  target_group VARCHAR(100) NOT NULL,
  hostility_level hostility_level NOT NULL,
  labels JSONB NOT NULL DEFAULT '[]',
  confidence DECIMAL(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rationale TEXT,
  from_cache BOOLEAN DEFAULT FALSE,
  model_used VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, framework, target_group)
);

-- Prompt templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(20) NOT NULL,
  task_type task_type NOT NULL,
  framework framework_type,
  template TEXT NOT NULL,
  output_schema JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(version, task_type, framework)
);

-- Cache entries table for LLM responses
CREATE TABLE IF NOT EXISTS cache_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id VARCHAR(20) NOT NULL,
  edited_utc BIGINT,
  task_type task_type NOT NULL,
  framework framework_type,
  model VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  response JSONB NOT NULL,
  tokens_used INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(comment_id, edited_utc, task_type, framework, model, prompt_version)
);

-- Configuration table for admin settings
CREATE TABLE IF NOT EXISTS configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rate limit events table
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL,
  limit_type VARCHAR(50) NOT NULL,
  retry_after INTEGER NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schedules table for automated scans
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subreddit VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subreddit)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_subreddit ON reports(subreddit);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_report_id ON jobs(report_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE INDEX IF NOT EXISTS idx_sampled_comments_report_id ON sampled_comments(report_id);
CREATE INDEX IF NOT EXISTS idx_sampled_comments_reddit_id ON sampled_comments(reddit_id);
CREATE INDEX IF NOT EXISTS idx_sampled_comments_is_moderator ON sampled_comments(is_moderator_comment);

CREATE INDEX IF NOT EXISTS idx_sentiment_classifications_comment_id ON sentiment_classifications(comment_id);

CREATE INDEX IF NOT EXISTS idx_target_group_classifications_comment_id ON target_group_classifications(comment_id);
CREATE INDEX IF NOT EXISTS idx_target_group_classifications_framework ON target_group_classifications(framework);

CREATE INDEX IF NOT EXISTS idx_cache_entries_lookup ON cache_entries(comment_id, edited_utc, task_type, framework, model, prompt_version);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires ON cache_entries(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at) WHERE is_active = TRUE;
`;

export const DROP_TABLES_SQL = `
DROP TABLE IF EXISTS rate_limit_events CASCADE;
DROP TABLE IF EXISTS cache_entries CASCADE;
DROP TABLE IF EXISTS target_group_classifications CASCADE;
DROP TABLE IF EXISTS sentiment_classifications CASCADE;
DROP TABLE IF EXISTS sampled_comments CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS prompt_templates CASCADE;
DROP TABLE IF EXISTS configurations CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS methodology_versions CASCADE;

DROP TYPE IF EXISTS task_type CASCADE;
DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS sampling_strategy CASCADE;
DROP TYPE IF EXISTS framework_type CASCADE;
DROP TYPE IF EXISTS hostility_level CASCADE;
DROP TYPE IF EXISTS sentiment_value CASCADE;
`;

export const SEED_DATA_SQL = `
-- Insert default methodology version
INSERT INTO methodology_versions (version, sentiment_prompt_version, target_group_prompt_version, sampling_algorithm_version, baseline_subreddits)
VALUES ('1.0.0', '1.0.0', '1.0.0', '1.0.0', '["news", "worldnews", "politics", "AskReddit"]')
ON CONFLICT (version) DO NOTHING;

-- Insert default prompt templates
INSERT INTO prompt_templates (version, task_type, framework, template, output_schema, is_active)
VALUES
  ('1.0.0', 'sentiment', NULL,
   'Analyze the sentiment of the following comments. For each comment, classify as positive, neutral, or negative. Also rate subjectivity from 0 (objective) to 1 (subjective).

Comments:
{{comments}}

Respond with a JSON array containing objects with: id, sentiment, subjectivity, confidence.',
   '{"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]}, "subjectivity": {"type": "number", "minimum": 0, "maximum": 1}, "confidence": {"type": "number", "minimum": 0, "maximum": 1}}, "required": ["id", "sentiment", "subjectivity", "confidence"]}}',
   TRUE),

  ('1.0.0', 'target_group', 'nexus',
   'Analyze the following comments for indicators of hostility toward {{target_group}} using the Nexus Document framework.

For each comment, determine:
1. Does it mention or reference {{target_group}}? (mentions_group: boolean)
2. Hostility level: none, low, medium, high
3. Labels (select all that apply): slur_or_epithet, dehumanization, stereotype_or_trope, conspiracy_claim, collective_blame, calls_for_exclusion_or_violence, denial_or_minimization
4. Brief rationale for classification

Comments:
{{comments}}

Respond with a JSON array.',
   '{"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "mentions_group": {"type": "boolean"}, "hostility_level": {"type": "string", "enum": ["none", "low", "medium", "high"]}, "labels": {"type": "array", "items": {"type": "string"}}, "confidence": {"type": "number"}, "rationale": {"type": "string"}}, "required": ["id", "mentions_group", "hostility_level", "labels", "confidence", "rationale"]}}',
   TRUE),

  ('1.0.0', 'target_group', 'jda',
   'Analyze the following comments for indicators of hostility toward {{target_group}} using the Jerusalem Declaration on Antisemitism (JDA) framework.

For each comment, determine:
1. Does it mention or reference {{target_group}}? (mentions_group: boolean)
2. Hostility level: none, low, medium, high
3. Labels (select all that apply): slur_or_epithet, dehumanization, stereotype_or_trope, conspiracy_claim, collective_blame, calls_for_exclusion_or_violence, denial_or_minimization
4. Brief rationale for classification

Comments:
{{comments}}

Respond with a JSON array.',
   '{"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "mentions_group": {"type": "boolean"}, "hostility_level": {"type": "string", "enum": ["none", "low", "medium", "high"]}, "labels": {"type": "array", "items": {"type": "string"}}, "confidence": {"type": "number"}, "rationale": {"type": "string"}}, "required": ["id", "mentions_group", "hostility_level", "labels", "confidence", "rationale"]}}',
   TRUE),

  ('1.0.0', 'target_group', 'ihra',
   'Analyze the following comments for indicators of hostility toward {{target_group}} using the IHRA working definition framework.

For each comment, determine:
1. Does it mention or reference {{target_group}}? (mentions_group: boolean)
2. Hostility level: none, low, medium, high
3. Labels (select all that apply): slur_or_epithet, dehumanization, stereotype_or_trope, conspiracy_claim, collective_blame, calls_for_exclusion_or_violence, denial_or_minimization
4. Brief rationale for classification

Comments:
{{comments}}

Respond with a JSON array.',
   '{"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "mentions_group": {"type": "boolean"}, "hostility_level": {"type": "string", "enum": ["none", "low", "medium", "high"]}, "labels": {"type": "array", "items": {"type": "string"}}, "confidence": {"type": "number"}, "rationale": {"type": "string"}}, "required": ["id", "mentions_group", "hostility_level", "labels", "confidence", "rationale"]}}',
   TRUE)
ON CONFLICT (version, task_type, framework) DO NOTHING;

-- Insert default configuration
INSERT INTO configurations (key, value)
VALUES
  ('sampling', '{"defaultStrategies": ["top", "new"], "defaultPostsPerStrategy": 25, "defaultCommentsPerPost": 50, "defaultMaxDepth": 2}'),
  ('models', '{"default": "openai/gpt-4o-mini", "fallback": "openai/gpt-3.5-turbo", "batchSize": 10}'),
  ('costs', '{"budgetPerReport": 1.0, "budgetPerMonth": 50.0}'),
  ('frameworks', '{"default": ["nexus", "jda"], "available": ["ihra", "jda", "nexus"]}')
ON CONFLICT (key) DO NOTHING;
`;

// Schema interface for type-safe migrations
export interface SchemaInfo {
  version: string;
  tables: string[];
  enums: string[];
}

export const SCHEMA_INFO: SchemaInfo = {
  version: SCHEMA_VERSION,
  tables: [
    'methodology_versions',
    'reports',
    'jobs',
    'sampled_comments',
    'sentiment_classifications',
    'target_group_classifications',
    'prompt_templates',
    'cache_entries',
    'configurations',
    'rate_limit_events',
    'schedules',
  ],
  enums: [
    'sentiment_value',
    'hostility_level',
    'framework_type',
    'sampling_strategy',
    'job_status',
    'task_type',
  ],
};
