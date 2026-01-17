# Subreddit Sentiment & Bias Signals Analyzer

A web platform for generating auditable, reproducible reports about subreddit language signals (sentiment + group-directed hostility indicators) from sampled public content.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-375%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/coverage-86%25-green)]()
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## Overview

This tool produces **objective, reproducible reports** about subreddit content, focusing on:

- **Community sentiment analysis** - Positive/neutral/negative distribution with confidence intervals
- **Moderator aggregate sentiment** - Aggregate-only analysis (no individual targeting)
- **Target-group hostility indicators** - Prevalence estimates for group-directed content using established frameworks (IHRA, JDA, Nexus)

### Key Principles

- **Objectivity** - Shows measured indicators + uncertainty, not verdicts
- **Reproducibility** - Deterministic sampling with seeds; methodology versioning
- **Safety** - Aggregate-only by default; strong disclaimers; no individual targeting

## Architecture

```
subreddit-bias/
├── apps/
│   ├── public/          # Next.js public website (Vercel)
│   └── admin/           # Next.js admin studio (localhost)
├── packages/
│   ├── core/            # Sampling, heuristics, scoring, aggregation
│   ├── db/              # Schema, types, Neon/Redis clients
│   └── llm/             # OpenRouter client, prompts, batching
└── vercel.json          # Deployment configuration
```

## Features

### Two-Stage Classification Cascade

Cost-optimized classification using:

1. **Stage A: Local Heuristics** - Fast lexicon-based classification for clear cases
2. **Stage B: LLM Classification** - OpenRouter API for ambiguous content

### Multi-Framework Support

Target-group analysis supports multiple frameworks:

- **IHRA** - International Holocaust Remembrance Alliance working definition
- **JDA** - Jerusalem Declaration on Antisemitism
- **Nexus** - Nexus Document (default)

### Statistical Rigor

- Wilson score confidence intervals for prevalence estimates
- Minimum sample size thresholds
- Baseline comparisons against peer subreddits

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Node.js >= 18 (for Next.js compatibility)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/subreddit-bias.git
cd subreddit-bias

# Install dependencies
bun install

# Run tests
bun test

# Start development servers
bun dev
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database (Neon Postgres)
DATABASE_URL=postgresql://...

# Cache (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# LLM API (OpenRouter)
OPENROUTER_API_KEY=sk-or-...

# Security
CRON_SECRET=your-secret-here
```

## Usage

### Running the Public Site

```bash
bun run --filter public dev
```

### Running the Admin Studio

```bash
bun run --filter admin dev
```

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific package tests
bun test packages/core
```

## API Reference

### Public API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports` | GET | List recent reports |
| `/api/reports/:id` | GET | Get report details |

### Admin API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/reports` | POST | Create new report |
| `/api/admin/reports` | GET | List all reports |
| `/api/admin/jobs` | GET | List jobs |
| `/api/admin/purge` | POST | Purge temporary data |

### Internal API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron/run` | POST | Trigger scheduled jobs |
| `/api/webhooks/job-progress` | POST | Update job progress |

## Configuration

### Sampling Configuration

```typescript
{
  strategies: ['top', 'new', 'controversial'],
  postsPerStrategy: 25,
  commentsPerPost: 50,
  maxDepth: 2,
  seed: 12345  // For reproducibility
}
```

### Budget Configuration

```typescript
{
  maxCommentsTotal: 5000,
  maxLLMCallsPerPhase: 500,
  maxCostUsd: 5.0,
  maxTotalTokens: 500000
}
```

## Methodology

### Sampling Strategy

To reduce selection bias, the tool uses a mixed sampling strategy:

- **Top posts** - Captures what the community amplifies
- **New posts** - Captures what the community produces
- **Controversial** (optional) - Captures disagreement pockets

### Classification Taxonomy

Target-group analysis uses a multi-label taxonomy:

- `slur_or_epithet`
- `dehumanization`
- `stereotype_or_trope`
- `conspiracy_claim`
- `collective_blame`
- `calls_for_exclusion_or_violence`
- `denial_or_minimization`

### Confidence Intervals

All prevalence estimates include Wilson score confidence intervals, accounting for sample size and binomial distribution properties.

## Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

The included `vercel.json` configures:
- Bun runtime
- Cron jobs (every 6 hours)
- Environment variable references

### Database Setup (Neon)

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Run the schema migrations from `packages/db/src/schema.ts`
3. Add the connection string to your environment

### Cache Setup (Upstash)

1. Create an Upstash Redis database at [upstash.com](https://upstash.com)
2. Add REST URL and token to your environment

## Limitations & Ethical Considerations

### What This Tool Measures

- **Content indicators** in sampled posts/comments
- **Prevalence estimates** with statistical uncertainty
- **Aggregate patterns**, not individual beliefs

### What This Tool Does NOT Measure

- Individual user beliefs or intentions
- "Ground truth" about community character
- Causal relationships

### Misuse Prevention

- **Aggregate-only** reporting by default
- **No "top users"** lists or individual targeting
- **Strong disclaimers** on all reports
- **Minimum sample sizes** before showing breakdowns

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/subreddit-bias.git

# Install dependencies
bun install

# Create a branch
git checkout -b feature/your-feature

# Make changes and test
bun test

# Submit a PR
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenRouter](https://openrouter.ai) for LLM API access
- [Neon](https://neon.tech) for serverless Postgres
- [Upstash](https://upstash.com) for serverless Redis
- [Vercel](https://vercel.com) for hosting

## Citation

If you use this tool in research, please cite:

```bibtex
@software{subreddit_bias_analyzer,
  title = {Subreddit Sentiment & Bias Signals Analyzer},
  year = {2024},
  url = {https://github.com/yourusername/subreddit-bias}
}
```

---

**Disclaimer**: This tool is for research and informational purposes only. Results should not be used to harass, target, or discriminate against individuals or communities.
