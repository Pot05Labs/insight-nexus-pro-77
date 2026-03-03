# CLAUDE.md — SignalStack

## Current Reality (What Actually Exists)

**Read this section first. Only build against what exists here. Do NOT reference tables, services, or infrastructure from the "Target Architecture" section below.**

### Live Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | React (Vite) + TypeScript + Tailwind + shadcn/ui | Single-page app |
| Backend/DB | Supabase (PostgreSQL + Auth + Realtime + RLS + Storage + Edge Functions) | All data lives here |
| AI | OpenRouter API → `google/gemini-2.5-flash` | Single Edge Function `ai-chat` |
| Payments | Stripe | Checkout, webhooks, subscription gate |
| Hosting | **Lovable** | Auto-deploys from GitHub repo `Pot05Labs/insight-nexus-pro-77` |

### Deployment Flow

```
Local dev (npm run dev) → Push to GitHub → Lovable auto-deploys → Live at signalstack.africa
Edge Functions deploy separately: supabase functions deploy
```

### Database Tables That Exist (Supabase PostgreSQL)

**Core data tables:**
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `sell_out_data` | Retailer sell-out rows | project_id, user_id, upload_id, retailer, brand, product_name_raw, sku, category, region, store_location, date, revenue, units_sold, cost, deleted_at |
| `campaign_data_v2` | Campaign/ad performance | project_id, user_id, upload_id, platform, channel, campaign_name, flight_start, flight_end, spend, impressions, clicks, conversions, revenue, deleted_at |
| `data_uploads` | Upload tracking | user_id, file_name, file_type, file_size, storage_path, source_name, source_type, status, row_count, column_names |
| `computed_metrics` | Cached metric values | user_id, project_id, metric_name, metric_value, dimensions (jsonb) |
| `narrative_reports` | AI-generated reports | user_id, project_id, content (jsonb), report_type |
| `chat_messages` | Query chat history | user_id, role, content |

**Platform tables:**
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup) |
| `projects` | Project containers (tenant isolation) |
| `notifications` | In-app notifications |
| `activity_log` | Audit trail |
| `user_roles` | RBAC roles |
| `user_preferences` | User settings |
| `waitlist_leads` | Pre-launch signups |

**Legacy/redundant tables (do not use for new features):**
| Table | Status |
|-------|--------|
| `campaign_data` | Replaced by `campaign_data_v2` |
| `file_uploads` | Redundant with `data_uploads` |
| `harmonized_sales` | Unused, 0 rows |
| `entity_matches` | Unused |
| `pipeline_runs` | Unused |

### AI Configuration

The AI Edge Function lives at `supabase/functions/ai-chat/index.ts`. It:
- Uses OpenRouter API with key stored as `OPENROUTER` Edge Function secret
- Currently routes ALL tasks to `google/gemini-2.5-flash`
- Has two system prompts: `INSIGHTS_SYSTEM` (strategic analysis with Jon Evans / Julian Cole / Rory Sutherland frameworks) and `QUERY_SYSTEM` (natural language to Supabase query translation)
- Streams responses via SSE
- Called from frontend via `src/services/aiChatStream.ts`

### File Processing

Currently ALL file parsing happens client-side in `src/services/clientFileProcessor.ts` (1,287 lines). This handles CSV, XLSX, PPTX, PDF. **This must move server-side — see Phase 3 of the rebuild plan.**

---

## Critical Rules

1. **Only query tables that exist in the "Database Tables That Exist" section above.** Do not write code that references `briefs`, `media_plans`, `rate_cards`, `market_context`, `context_documents`, or any other table not listed.

2. **All file parsing must happen server-side in Edge Functions, never in the browser.** The browser should only upload to Supabase Storage and watch status via Realtime.

3. **All data tables use soft deletes (`deleted_at`).** Every SELECT query on `sell_out_data`, `campaign_data_v2`, `narrative_reports`, and `computed_metrics` MUST include `.is("deleted_at", null)`. For `data_uploads`, filter by `.neq("status", "archived")`.

4. **All queries must be scoped to the authenticated user's project.** Multi-tenancy via `project_id` or `user_id` — never return data belonging to other users.

5. **All monetary values are in ZAR** (South African Rand) with `R` prefix (e.g., R1,250,000). Never use `$`.

6. **Use shadcn/ui + Tailwind CSS only.** No new component libraries. No inline styles.

7. **Never hard delete data.** Always set `deleted_at = now()` or `status = 'archived'`.

8. **Do not modify RLS policies, auth flows, or Stripe webhook handlers** without explicit instruction.

---

## AI Model Routing (OpenRouter)

All tasks use `openrouter/auto` which lets OpenRouter pick the best available model per request. Fallback is `google/gemini-2.5-flash` if auto-routing fails. **Do NOT use DeepSeek models** — they are too slow and burn credits without returning results.

| Task | Primary Model | Fallback |
|------|--------------|----------|
| All tasks | `openrouter/auto` | `google/gemini-2.5-flash` |

---

## Mission

SignalStack is a **Commerce Intelligence Harmoniser** built by Pot Labs (Pot Strategy Pty Ltd). It connects advertising spend to commercial outcomes for FMCG brands and retailers in South Africa.

**Live URL:** https://signalstack.africa
**Company:** Pot Labs / Pot Strategy (Pty) Ltd
**Market:** South African FMCG commerce ecosystem

---

## Platform Maturity Levels

| Level | Capability | Core Question | Status |
|-------|-----------|---------------|--------|
| **1** | Descriptive Reporting | "What happened?" | Built |
| **2** | Comparative Analysis | "How does it compare?" | Partial |
| **3** | Scenario Simulation | "What could happen?" | Not Built |
| **4** | Strategic Allocation | "Where should we invest?" | Not Built |
| **5** | Continuous Optimisation | "How do we stay optimal?" | Not Built |

**Build order:** Level 2 (complete) → Level 3 → Level 4 → Level 5. Do not skip levels.

---

## Level 1 — Descriptive Reporting (Built)

### Features Complete
- Upload Hub — CSV/XLSX/PPTX/PDF ingestion with auto-detection
- Dashboard — Revenue, Units, AOV, Products KPIs
- Products Page — Top 10 by revenue, category breakdown
- Retailers Page — Revenue by retailer
- Geography Page — Revenue by province/store
- Behaviour Page — Order composition, day-of-week, AI segmentation
- Campaigns Page — Performance over time, platform breakdown, flight calendar, attribution
- AI Insights — Generate strategic reports (What/So What/Now What framework)
- Natural Language Query — Chat interface for data questions
- Auth, RBAC, Stripe billing, notifications, real-time updates

---

## Level 2 — Comparative Analysis (In Progress)

### Priority Features to Build
| Feature | Priority |
|---------|----------|
| Period-over-Period (WoW, MoM, YoY) | P0 |
| Cross-Retailer Benchmarking | P0 |
| SKU Normalisation Engine | P0 |
| Campaign Attribution (lift windows) | P0 |
| Anomaly Detection (stats + AI explanation) | P0 |
| Data Quality Scoring | P0 |

---

## South African Context

- **Currency:** ZAR — format with `R` prefix (R1,250,000)
- **Retailers:** Pick n Pay, Checkers/Shoprite Group, Woolworths, Spar, Makro, Game, Clicks, Dis-Chem
- **Provinces:** Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape
- **Seasonality:** Festive (Nov-Jan), Back-to-School (Jan-Feb), Easter, Heritage Month (Sep)
- **Media:** Meta, Google, TikTok, DStv/Multichoice, OOH, in-store

---

## Development Conventions

- **Components:** PascalCase (`ProductsPage.tsx`)
- **Utilities:** kebab-case (`chart-utils.ts`)
- **DB tables:** snake_case (`sell_out_data`)
- **Supabase functions:** snake_case
- React Query (`@tanstack/react-query`) is installed — use it for all data fetching
- Charts: Recharts with existing `chart-utils.ts` patterns
- Dark mode must be supported

---

## Target Architecture (FUTURE — DO NOT BUILD AGAINST)

The following is the long-term target for Levels 3-5 at scale. **Do not write code against these systems — they do not exist yet.**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Analytical Engine | ClickHouse or Apache Druid | Columnar OLAP for billions of rows |
| Streaming | Kafka / Redpanda | Real-time data pipelines |
| Batch ETL | dbt + staging tables | Historical data transformations |
| Data Science | Python (FastAPI) + PyMC | MMM, forecasting, optimisation |
| Model Registry | MLflow | Track model versions |
| Orchestration | Temporal or Prefect | Workflow orchestration |
| Cache | Redis | Query caching, rate limiting |

Migrate to this architecture when data exceeds PostgreSQL limits (~10M+ rows in analytical tables).

---

## Pricing Tiers (SaaS)

| Level | Tier | Monthly Price |
|-------|------|--------------|
| 2 | Starter | $999 - $2,999 |
| 3 | Professional | $2,999 - $4,999 |
| 4 | Enterprise | $4,999 - $9,999 |
| 5 | Enterprise+ | $10,000+ |

---

## Do NOT

- Query tables that don't exist in the schema
- Parse files in the browser (move to Edge Functions)
- Hard delete data (use soft deletes)
- Bypass tenant scoping on any query
- Introduce new UI frameworks
- Run analytical models in the browser
- Show predictions without confidence intervals
- Modify RLS policies, auth flows, or Stripe webhooks without instruction
- Reference ClickHouse, Kafka, Redis, MLflow, or Temporal in application code (these don't exist yet)
