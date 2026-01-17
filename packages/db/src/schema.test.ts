import { describe, test, expect } from 'bun:test';
import {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL,
  DROP_TABLES_SQL,
  SEED_DATA_SQL,
  SCHEMA_INFO,
} from './schema';

describe('Schema', () => {
  describe('SCHEMA_VERSION', () => {
    test('is a valid semver string', () => {
      expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('CREATE_TABLES_SQL', () => {
    test('contains required tables', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS reports');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS jobs');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS sampled_comments');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS sentiment_classifications');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS target_group_classifications');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS prompt_templates');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS cache_entries');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS configurations');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS rate_limit_events');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS schedules');
      expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS methodology_versions');
    });

    test('contains required enum types', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE sentiment_value');
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE hostility_level');
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE framework_type');
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE sampling_strategy');
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE job_status');
      expect(CREATE_TABLES_SQL).toContain('CREATE TYPE task_type');
    });

    test('contains indexes', () => {
      expect(CREATE_TABLES_SQL).toContain('CREATE INDEX IF NOT EXISTS');
      expect(CREATE_TABLES_SQL).toContain('idx_reports_subreddit');
      expect(CREATE_TABLES_SQL).toContain('idx_jobs_report_id');
      expect(CREATE_TABLES_SQL).toContain('idx_cache_entries_lookup');
    });

    test('contains UUID extension', () => {
      expect(CREATE_TABLES_SQL).toContain('uuid-ossp');
    });
  });

  describe('DROP_TABLES_SQL', () => {
    test('drops all tables', () => {
      expect(DROP_TABLES_SQL).toContain('DROP TABLE IF EXISTS reports');
      expect(DROP_TABLES_SQL).toContain('DROP TABLE IF EXISTS jobs');
      expect(DROP_TABLES_SQL).toContain('DROP TABLE IF EXISTS sampled_comments');
    });

    test('drops all enum types', () => {
      expect(DROP_TABLES_SQL).toContain('DROP TYPE IF EXISTS sentiment_value');
      expect(DROP_TABLES_SQL).toContain('DROP TYPE IF EXISTS hostility_level');
      expect(DROP_TABLES_SQL).toContain('DROP TYPE IF EXISTS framework_type');
    });

    test('uses CASCADE', () => {
      expect(DROP_TABLES_SQL).toContain('CASCADE');
    });
  });

  describe('SEED_DATA_SQL', () => {
    test('inserts default methodology version', () => {
      expect(SEED_DATA_SQL).toContain('INSERT INTO methodology_versions');
      expect(SEED_DATA_SQL).toContain("'1.0.0'");
    });

    test('inserts prompt templates', () => {
      expect(SEED_DATA_SQL).toContain('INSERT INTO prompt_templates');
      expect(SEED_DATA_SQL).toContain("'sentiment'");
      expect(SEED_DATA_SQL).toContain("'target_group'");
    });

    test('inserts default configurations', () => {
      expect(SEED_DATA_SQL).toContain('INSERT INTO configurations');
      expect(SEED_DATA_SQL).toContain("'sampling'");
      expect(SEED_DATA_SQL).toContain("'models'");
      expect(SEED_DATA_SQL).toContain("'costs'");
      expect(SEED_DATA_SQL).toContain("'frameworks'");
    });

    test('uses ON CONFLICT DO NOTHING', () => {
      expect(SEED_DATA_SQL).toContain('ON CONFLICT');
      expect(SEED_DATA_SQL).toContain('DO NOTHING');
    });
  });

  describe('SCHEMA_INFO', () => {
    test('has correct version', () => {
      expect(SCHEMA_INFO.version).toBe(SCHEMA_VERSION);
    });

    test('lists all tables', () => {
      expect(SCHEMA_INFO.tables).toContain('reports');
      expect(SCHEMA_INFO.tables).toContain('jobs');
      expect(SCHEMA_INFO.tables).toContain('sampled_comments');
      expect(SCHEMA_INFO.tables).toContain('sentiment_classifications');
      expect(SCHEMA_INFO.tables).toContain('target_group_classifications');
      expect(SCHEMA_INFO.tables).toContain('prompt_templates');
      expect(SCHEMA_INFO.tables).toContain('cache_entries');
      expect(SCHEMA_INFO.tables).toContain('configurations');
      expect(SCHEMA_INFO.tables).toContain('rate_limit_events');
      expect(SCHEMA_INFO.tables).toContain('schedules');
      expect(SCHEMA_INFO.tables).toContain('methodology_versions');
    });

    test('lists all enums', () => {
      expect(SCHEMA_INFO.enums).toContain('sentiment_value');
      expect(SCHEMA_INFO.enums).toContain('hostility_level');
      expect(SCHEMA_INFO.enums).toContain('framework_type');
      expect(SCHEMA_INFO.enums).toContain('sampling_strategy');
      expect(SCHEMA_INFO.enums).toContain('job_status');
      expect(SCHEMA_INFO.enums).toContain('task_type');
    });

    test('has correct counts', () => {
      expect(SCHEMA_INFO.tables).toHaveLength(11);
      expect(SCHEMA_INFO.enums).toHaveLength(6);
    });
  });
});
