# PRD - Subreddit Sentiment & Bias Signals Analyzer (Vercel + Neon) — v0.2

## 0. Updates from v0.1 (your notes)

1. **Deployment**: Vercel-hosted public site; Postgres via Neon integration (Vercel’s recommended Postgres path). Vercel’s legacy “Vercel Postgres” and “Vercel KV” are no longer available for new projects; Postgres goes via Marketplace (Neon), and Redis via Marketplace (Upstash).
2. **Two apps**: a localhost Admin Studio (configure/run/monitor) + a beautiful public site deployed on Vercel.
3. **Methodology audit**: redesigned to improve objectivity, reproducibility, and clarity on what is (and is not) being measured.
4. **Target-group analysis**: add group-directed sentiment / hate-signal detection (e.g., “antisemitic rhetoric indicators”), with guardrails to avoid individual targeting and overclaiming.

---

## 1. Summary

Build a web platform that produces auditable, reproducible reports about a subreddit’s language signals (sentiment + group-directed hostility indicators) from sampled public content, focusing on:

- **Community sample**: comments on a defined set of posts from the subreddit
- **Moderator sample**: public comments by moderators (sampled), reported primarily in aggregate to reduce targeting risk

Sentiment / classification uses OpenRouter (OpenAI-compatible) and is designed with strict cost controls (caching, batching, cascades).

The public UI should be Vercel-inspired: minimal, modern, premium. Admin Studio is local-only.

---

## 2. Goals

### MVP goals

- Generate a report for `r/<subreddit>` with:
  - Sentiment distributions (community + mods aggregate)
  - “Language indicators” that are explicitly defined and versioned
  - Confidence/uncertainty and sampling metadata
  - Optional target-group analysis (e.g., antisemitic rhetoric indicators) as prevalence estimates in sampled content, not claims about “beliefs”

### Key product principles

- **Objectivity**: avoid “verdicts”; show measured indicators + uncertainty.
- **Reproducibility**: deterministic sampling with a seed; store methodology version with every report.
- **Safety**: avoid individual targeting (default aggregate); strong disclaimers; don’t label “members”.

---

## 3. What we’re measuring (methodology audit & redesign)

### Your original idea (audit)

- **Risk 1: Selection bias.** “Popular posts” skew toward highly emotional / controversial threads; using only top posts can overstate negativity or polarization.
- **Risk 2: Construct validity.** General sentiment ≠ “bias.” A community can be negative without being biased; bias is multi-dimensional.
- **Risk 3: Moderator inference.** Mod comment history may be unrelated to mod actions; and cross-subreddit comments may not represent moderation behavior.

### Revised, more objective methodology

We shift from “bias” claims to Bias Signals / Skew Indicators that are:

- **Defined** (mathematically and semantically),
- **Auditable** (comment IDs + permalinks; no raw text retention),
- **Comparable** (baseline comparisons),
- **Uncertain** (confidence intervals + sample sizes).

### 3.1 Sampling (reduce selection bias)

For community analysis, use a mixed sampling strategy per timeframe:

- **A) Top posts** (captures what the community amplifies)
- **B) New posts** (captures what the community produces)
- **C) Optional: Controversial** (captures disagreement pockets)

Within each stratum, sample posts, then sample comments with caps:

- Prefer breadth over depth (e.g., max depth=2, cap per thread).
- Exclude deleted/removed bodies from analysis (but keep IDs).

Sampling must be deterministic given (subreddit, timeframe, depth, seed) so a report can be reproduced.

### 3.2 Baselines (reduce confounding)

Add an optional baseline comparison:

- Compare indicators to:
  - a matched set of “peer subreddits” (user-provided list), or
  - a rolling “platform baseline” built from a small, fixed list of general subreddits (kept constant per methodology version)

Output deltas, not absolute moral judgments.

### 3.3 Separate tasks: sentiment vs hate/targeted hostility

- **Sentiment classifier**: positive/neutral/negative + subjectivity (generic tone)
- **Target-group hostility classifier**: multi-label taxonomy (below) with explicit definitions

This prevents “negative sentiment” from being conflated with “prejudice.”

---

## 4. Target-group analysis (antisemitism / racism / etc.) — requirements & guardrails

### User-facing feature

Allow a report question like:
> “In the sampled content, what is the estimated prevalence of antisemitic rhetoric indicators?”

**Important**: The system must not claim “members express beliefs.” It must report:
> “In this sample of N comments, X% were classified as containing antisemitic rhetoric indicators (CI …).”

### Definitions and contested boundaries

Because definitions of antisemitism differ, the tool must support framework selection and show it in the report:

- **IHRA working definition** (commonly used)
- **Jerusalem Declaration on Antisemitism (JDA)**
- **Nexus Document**

**Default**: Nexus + JDA for “speech boundary nuance,” with IHRA available as an option, and reports clearly stating which framework was used.

### Taxonomy (multi-label, auditable)

For target-group analysis, classify each relevant comment into:

- `mentions_group` (yes/no)
- `hostility` (none/low/medium/high)
- Labels (0..n):
  - `slur_or_epithet`
  - `dehumanization`
  - `stereotype_or_trope`
  - `conspiracy_claim`
  - `collective_blame`
  - `calls_for_exclusion_or_violence`
  - `denial_or_minimization` (where applicable)
- `confidence` and `short rationale`

### Guardrails (mandatory)

- Aggregate-only by default; no per-user labeling.
- No “Top antisemitic users” or similar.
- Require minimum sample sizes before showing subgroup breakdowns.
- Provide a “Limitations” callout: classifier errors, sarcasm, quoted slurs, reclaimed language, political speech edge cases.
- Provide a “Misuse prevention” banner: do not harass, do not target individuals.

---

## 5. App architecture: Public site + Local Admin Studio

### 5.1 Monorepo layout (recommended)

- `apps/public` — Next.js public website (deploy to Vercel)
- `apps/admin` — Next.js Admin Studio (runs only on localhost)
- `packages/core` — shared sampling + scoring + aggregation logic
- `packages/db` — schema + migrations + query helpers
- `packages/llm` — OpenRouter client + batching + caching

### 5.2 Admin Studio (localhost-only)

Runs locally (`bun dev --filter admin`) and connects to the same Neon Postgres.

**Features**:

- **Configure**:
  - sampling budgets, seed strategy, peer subreddits baseline list
  - OpenRouter model + prompt versions
  - target-group frameworks enabled (IHRA/JDA/Nexus)
- **Run**:
  - ad-hoc scans (queue jobs)
  - scheduled scans (write schedules, optionally create vercel.json cron entries)
- **Monitor**:
  - job progress states, retries, rate-limit events, OpenRouter token/cost summaries
- **Audit**:
  - view comment IDs + permalinks selected in sample
  - inspect classifier outputs (without retaining full text long-term)

### 5.3 Public website (Vercel)

- Beautiful report pages at stable URLs
- Read-only access to completed reports
- Optional “Recent reports” (can be disabled for privacy)

---

## 6. Deployment & infrastructure (Vercel + Neon + Redis)

### Postgres (Neon)

Use Vercel Marketplace Neon integration (serverless Postgres).
*Note: Vercel “Vercel Postgres” was transitioned to Neon; for new projects, use Marketplace integrations.*

### Redis / queues / caching (Upstash)

Use Upstash Redis via Vercel Marketplace.
*Also note: Vercel KV is no longer available for new projects; it moved to Upstash for existing stores.*

### Scheduled runs

Use Vercel Cron Jobs to trigger scan endpoints.

### Bun runtime

Vercel supports Bun runtime (beta) and can be enabled via `vercel.json` (`bunVersion`).

---

## 7. API surface (Next.js Route Handlers)

Use Next.js Route Handlers (`app/api/.../route.ts`) for internal APIs.

### Endpoints

- `POST /api/admin/reports` (admin token required) — create report job
- `GET /api/reports/:id` — read report summary
- `POST /api/cron/run` — cron entry point (secured)
- `POST /api/webhooks/job-progress` (optional)

---

## 8. Cost minimization (hard requirements)

### 1. Two-stage cascade

- **Stage A**: cheap local heuristics (lexicon/VADER-ish; rules for obviously neutral/short)
- **Stage B**: LLM classification for:
  - ambiguous cases
  - target-group detection where rules indicate relevance

### 2. Batching

- Send multiple comments per request with strict JSON output schema.

### 3. Caching

- Cache by `(comment_id, edited_utc, task_type, model, prompt_version)`.

### 4. Budgets

- Hard cap max comments sent to OpenRouter per depth level, separately for:
  - community sentiment
  - target-group detection
  - moderator sentiment

### 5. Prompt versioning

- Store prompt templates in DB with semantic versioning; every report stores prompt version IDs.

---

## 9. Data retention & auditability

- **Store**: IDs, timestamps, permalink, classifier outputs, aggregates, methodology version, sampling seed.
- **Do not store** full comment bodies beyond what is necessary for processing.
- Add a purge job to remove any temporarily stored content quickly.

---

## 10. Acceptance criteria (MVP)

- **Public site on Vercel shows**:
  - community sentiment distribution
  - moderator aggregate sentiment distribution
  - optional target-group indicator section (if enabled) with:
    - framework used (IHRA/JDA/Nexus)
    - prevalence estimate + confidence interval
    - label breakdowns (tropes, dehumanization, etc.)
    - strong limitations disclaimer
- **Admin Studio on localhost can**:
  - configure sampling + models
  - run jobs
  - monitor progress and cost estimates
  - inspect sampled comment IDs and outputs
- **Reports** are reproducible given the same parameters + seed.

---

## 11. Language to use in the UI (to stay objective)

**Use**:
- “signals”, “indicators”, “prevalence in sampled content”, “estimated”, “confidence interval”

**Avoid**:
- “members believe”, “this subreddit is antisemitic”, “proof”, “verdict”

---

If you want, I can now produce:
- a repo scaffold spec (monorepo with apps/public + apps/admin + shared packages),
- the DB schema + migrations tuned for Neon,
- and a prompt pack for (a) sentiment and (b) target-group hostility taxonomy with strict JSON outputs.