# CLAUDE.md — SignalStack

## Mission

SignalStack is a **Commerce Intelligence Harmoniser** built by Pot Labs (Pot Strategy Pty Ltd). It connects advertising spend to commercial outcomes for FMCG brands and retailers. The platform ingests retailer sell-out data and campaign performance data at scale — billions to trillions of rows — harmonises them into a single source of truth, and delivers AI-powered insights, simulation, optimisation, and autonomous reallocation.

**Live URL:** https://signalstack.africa
**Company:** Pot Labs / Pot Strategy (Pty) Ltd
**Market:** South African FMCG commerce ecosystem (expanding)

---

## Platform Maturity Levels

SignalStack is built in five progressive levels. Each level compounds on the previous. All five levels must be built. Never treat any level as out of scope.

| Level | Capability | Core Question | Status |
|-------|-----------|---------------|--------|
| **1** | Descriptive Reporting | "What happened?" | ✅ Built |
| **2** | Comparative Analysis | "How does it compare?" | 🔧 Partial |
| **3** | Scenario Simulation | "What could happen?" | ❌ Not Built |
| **4** | Strategic Allocation | "Where should we invest?" | ❌ Not Built |
| **5** | Continuous Optimisation | "How do we stay optimal?" | ❌ Not Built |

**Critical dependency chain:** Level 2 → Level 3 → Level 4 → Level 5. Each level requires the previous level's data quality and models to function. Do not skip levels.

---

## Architecture Overview

### Current Stack (Level 1-2)

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend/DB | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| AI | OpenAI GPT-4o |
| Payments | Stripe |
| Hosting | Lovable |

### Target Stack (Levels 3-5 Scale)

The platform must handle **billions to trillions of data points** with live streaming ingestion. This requires evolving beyond the current Supabase-only architecture. The following target architecture should guide all scaling decisions:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React (Vite) + TypeScript + shadcn/ui | Remains consistent across all levels |
| **API Gateway** | Supabase Edge Functions / FastAPI | Request routing, auth, rate limiting |
| **Auth & RBAC** | Supabase Auth | Stays as-is; extend roles for enterprise |
| **Transactional DB** | Supabase PostgreSQL | User profiles, subscriptions, configs, metadata |
| **Analytical Engine** | ClickHouse or Apache Druid | Columnar OLAP for sub-second queries over billions of rows |
| **Streaming Ingestion** | Apache Kafka / Redpanda → ClickHouse | Real-time data pipelines from retailer APIs and ad platforms |
| **Batch Ingestion** | Apache Spark or dbt + staging tables | Historical data loads, transformations, SKU normalisation |
| **Object Storage** | S3-compatible (Supabase Storage / R2 / S3) | Raw file uploads (CSV/XLSX) before processing |
| **Data Science** | Python (FastAPI microservice) | MMM, forecasting, optimisation models (PyMC, LightweightMMM, scipy) |
| **Model Registry** | MLflow or custom | Track model versions, performance, retraining schedules |
| **Orchestration** | Temporal or Prefect | Workflow orchestration for ETL, model training, report generation |
| **Cache** | Redis | Query caching, session state, rate limiting |
| **AI/LLM** | OpenAI GPT-4o (extend to Claude API as needed) | Narrative insights, NLQ, anomaly explanations |
| **Payments** | Stripe | Tiered SaaS billing |
| **Hosting** | Lovable (frontend) + Railway/Render/Fly.io (backend services) | Frontend stays on Lovable; backend services deploy separately |

### Scaling Philosophy

1. **Separate OLTP from OLAP.** Supabase PostgreSQL handles transactional data (users, profiles, subscriptions, configs). All analytical queries over sell-out and campaign data must route to a columnar store (ClickHouse/Druid) once data exceeds PostgreSQL's practical limits.

2. **Ingest raw, transform in layers.** Raw uploads land in object storage. A processing pipeline validates, normalises (SKU matching), and loads into the analytical engine. Never transform data on the frontend.

3. **Stream where possible, batch where necessary.** Live retailer API feeds and ad platform webhooks stream via Kafka/Redpanda. Historical bulk uploads batch process via Spark/dbt.

4. **Pre-aggregate for speed.** Materialised views and rollup tables (daily, weekly, monthly by retailer × brand × category × province) serve dashboard queries. Raw detail data available for drill-down.

5. **Models run server-side.** All statistical models (MMM, optimisation, forecasting) run on a Python backend, never in the browser. The frontend calls prediction APIs.

6. **Cache aggressively.** Dashboard KPIs, AI insights, and model predictions cache in Redis with TTLs appropriate to data freshness requirements.

---

## Level 1 — Descriptive Reporting ✅

**Status: Built**

### Features Complete

- **Upload Hub** — CSV/XLSX ingestion with auto-detection of sell-out vs campaign data
- **Dashboard KPIs** — Total Revenue (ZAR), Units Sold, Avg Order Value, Unique Products
- **Products Page** — Top 10 by revenue, category donut, sortable performance table
- **Retailers Page** — Revenue by retailer bar chart, sortable table with store counts
- **Geography Page** — Top 5 stores, revenue by province, geographic distribution
- **Behaviour Page** — Order composition, day-of-week, AI customer segmentation
- **Campaigns Page** — Performance over time, platform breakdown, flight calendar
- **Campaign Overlay** — Dual-axis (revenue + ad spend), correlation visualisation
- **AI Insights** — GPT-4o narrative analysis on every page via "Generate Insights"
- **Natural Language Query** — Chat interface for ad-hoc data questions

### Infrastructure Complete

- Authentication (email/password, Zod validation, forgot/reset)
- RBAC (admin/analyst/viewer with RLS on all tables)
- Profiles (auto-created on signup, company, role, avatar, Stripe fields)
- Audit columns (created_at, updated_at, deleted_at soft deletes)
- Performance indexes (user_id, date, brand, category, retailer, province)
- Stripe billing (checkout, webhooks, subscription gate, billing page)
- Supabase Realtime (subscriptions, notifications, activity feed, presence)
- Notification system (bell icon, unread badge, dropdown, mark-as-read)

### Scale Milestone for Level 1

Current: 154,996 rows in PostgreSQL. Must migrate analytical queries to columnar store before hitting 10M+ rows. Upload Hub must support files up to 1GB with background processing and progress indicators.

---

## Level 2 — Comparative Analysis 🔧

**Status: Partial (cross-retailer bar chart exists)**

### Features to Build

| Feature | Description | Priority |
|---------|------------|----------|
| **Period-over-Period** | WoW, MoM, YoY comparison with delta indicators on every KPI | P0 |
| **Cross-Retailer Benchmarking** | Side-by-side retailer performance with indexed scoring | P0 |
| **Brand Benchmarking** | Rank brands by growth rate, market share within category | P0 |
| **Campaign Attribution** | Match campaign flight dates to sell-out lift windows; calculate incremental revenue | P0 |
| **Anomaly Detection** | Flag unusual spikes/drops with AI-generated explanations | P0 |
| **Data Quality Scoring** | Score datasets on completeness, consistency, freshness; flag issues | P0 |
| **SKU Normalisation Engine** | Fuzzy match messy retailer SKU names to master product catalogue using AI | P0 |
| **Halo Effect Analysis** | Measure campaign for Product A on sales of Products B, C, D | P1 |
| **Store Clustering** | Group stores by performance tier (top/mid/bottom) | P1 |
| **Automated Reports** | Scheduled PDF/email reports with AI executive summaries | P1 |

### Technical Guidance for Level 2

- Period-over-period requires **date-range query optimisation** — ensure the analytical engine can efficiently compare two arbitrary date ranges across all dimensions.
- SKU normalisation is a **critical data quality dependency** for all downstream levels. Build it as a pipeline step that runs on every upload, using fuzzy matching (Levenshtein/Jaro-Winkler) + GPT-4o for ambiguous cases. Store the master catalogue as a separate table.
- Campaign attribution needs a **lift window calculator** — for each campaign flight, define a pre/during/post window and calculate incremental uplift vs baseline.
- Anomaly detection should use **statistical methods first** (z-score, IQR) with AI-generated natural language explanations, not pure LLM classification.

---

## Level 3 — Scenario Simulation ❌

**Status: Not Built**

### Features to Build

| Feature | Description | Priority |
|---------|------------|----------|
| **Media Mix Model (MMM)** | Bayesian regression relating ad spend by channel to sell-out outcomes | P0 |
| **What-If Simulator** | Interactive UI: drag sliders to adjust spend, see predicted revenue impact | P0 |
| **Campaign Planner** | Define upcoming flights with budget/channel/audience; predict lift and ROAS | P0 |
| **Budget Scenario Builder** | Create, save, compare multiple allocation scenarios side-by-side | P0 |
| **Confidence Intervals** | Show best/base/worst case on all forecasts; quantify uncertainty | P0 |
| **Historical Backtesting** | Validate model accuracy against held-out historical data | P0 |
| **Seasonality Engine** | Model seasonal patterns (festive, back-to-school, Easter) | P1 |
| **Retailer Investment Planner** | Allocate trade spend across retailers based on responsiveness | P1 |
| **Promotion Simulator** | Model price promotions, gondola-end displays, loyalty activations | P1 |

### Technical Guidance for Level 3

- **This is the hardest engineering leap.** Levels 1-2 are data visualisation. Level 3 is data science.
- MMM should use **PyMC or Google's LightweightMMM** running as a Python microservice (FastAPI on Railway/Render).
- The what-if simulator is a **frontend feature** that calls the trained model's prediction API with adjusted inputs. It does not retrain the model.
- Model training runs on **historical data** and retrains periodically (weekly or on new data arrival).
- All models must expose **confidence intervals** — never show point predictions without uncertainty ranges.
- Backtesting must use **time-series cross-validation** (expanding window), not random splits.
- At scale, MMM must handle **billions of rows** of historical data. Pre-aggregate to daily granularity by channel × retailer × brand before feeding into the model. Raw row-level data stays in the analytical engine for drill-down.

---

## Level 4 — Strategic Allocation ❌

**Status: Not Built**

### Features to Build

| Feature | Description | Priority |
|---------|------------|----------|
| **Optimal Budget Allocator** | Constrained optimisation: given total budget, maximise revenue/ROAS | P0 |
| **Incrementality Calculator** | Causal inference (diff-in-diff, geo-lift tests) to isolate true incremental impact | P0 |
| **Channel Prioritisation Matrix** | 2×2 framework: efficiency (ROAS) vs scale (total revenue contribution) | P0 |
| **Diminishing Returns Curves** | Visualise saturation point per channel | P0 |
| **Executive Decision Dashboard** | One-page C-suite view: recommended allocation, impact, confidence, approval | P0 |
| **Multi-Retailer Arbitrage** | Identify best retailer × channel combinations for ROI | P1 |
| **Category Investment Strategy** | Portfolio-level allocation across product categories | P1 |
| **Approval Workflows** | Route budget recommendations through stakeholder approval chains | P1 |
| **Integration: Ad Platforms** | Push budgets to Meta, Google, TikTok ad managers via APIs | P2 |
| **Integration: Retailer Portals** | Auto-pull sell-out data from Pick n Pay, Checkers, Woolworths | P2 |

### Technical Guidance for Level 4

- The optimiser is essentially **running the Level 3 what-if simulator thousands of times** to find the best allocation under constraints. Use `scipy.optimize` or `cvxpy` for constrained optimisation.
- Incrementality testing requires **quasi-experimental design** — geo-lift tests need store-level data with sufficient geographic variation.
- Diminishing returns curves are derived from the **MMM response curves** — the marginal return at each spend level per channel.
- Executive dashboard must be **real-time** — pulling from cached model predictions, not running models on demand.
- Approval workflows need a **state machine** (draft → submitted → approved → activated) with audit trail.
- Ad platform integrations use their respective APIs (Meta Marketing API, Google Ads API, TikTok Marketing API). Build as **modular connectors** so new platforms can be added.

---

## Level 5 — Continuous Optimisation ❌

**Status: Not Built**

### Features to Build

| Feature | Description | Priority |
|---------|------------|----------|
| **Always-On Learning** | Auto-retrain models as new data arrives | P0 |
| **Drift Detection** | Alert when predictions diverge from actuals beyond threshold | P0 |
| **Dynamic Reallocation Alerts** | Proactive notifications recommending budget shifts | P0 |
| **Real-Time Data Ingestion** | API connectors for automatic sell-out and campaign data pull (no manual uploads) | P0 |
| **Impact Scorecards** | Automated monthly: what was recommended, what was implemented, actual impact | P0 |
| **Auto-Optimisation Engine** | With user permission, auto-adjust live campaign budgets via ad platform APIs | P1 |
| **Multi-Brand Orchestration** | Portfolio-level budget optimisation across multiple brands | P1 |
| **Feedback Loops** | Users rate recommendation quality; platform learns from feedback | P1 |
| **Predictive Alerts** | AI predicts stock-outs, campaign fatigue, seasonal shifts before they happen | P1 |
| **Competitive Intelligence** | Ingest market data (Nielsen, IRI, Euromonitor) for benchmarking | P2 |

### Technical Guidance for Level 5

- **This is where SignalStack becomes autonomous.** The human role shifts from analysis to governance.
- Always-on learning requires an **orchestration layer** (Temporal/Prefect) that triggers model retraining on data arrival events.
- Drift detection uses **statistical process control** — track prediction error over time, alert when it crosses threshold (e.g., 2σ above baseline).
- Real-time ingestion requires **streaming infrastructure** (Kafka/Redpanda) with connectors for each data source.
- Auto-optimisation must have **guardrails**: maximum budget shift per cycle, mandatory human approval above threshold, automatic rollback if performance degrades.
- Impact scorecards are the **revenue justification** for the platform. They must be accurate and auditable.
- At this level, the platform processes **trillions of data points** across multiple brands, retailers, and channels simultaneously. Every query path must be optimised: pre-aggregated rollups, columnar scans, query caching.

---

## Data Architecture at Scale

### Ingestion Tiers

```
Tier 1: Manual Upload (Current — CSV/XLSX)
  → Object Storage → Validation → SKU Normalisation → Analytical Engine

Tier 2: Scheduled Pull (Level 2-3)
  → Orchestrator triggers API pulls on schedule → Transform → Load

Tier 3: Real-Time Stream (Level 4-5)
  → Kafka/Redpanda → Stream Processing → Analytical Engine
  → Sources: retailer POS APIs, ad platform webhooks, market data feeds
```

### Storage Architecture

```
Hot:    Redis (cached KPIs, model predictions, session state)
Warm:   ClickHouse/Druid (analytical queries, last 2 years)
Cool:   PostgreSQL via Supabase (transactional data, configs, profiles)
Cold:   S3/R2 (raw uploads, model artifacts, historical archives)
```

### Query Performance Targets

| Query Type | Target Latency | Strategy |
|-----------|---------------|----------|
| Dashboard KPIs | < 200ms | Pre-aggregated rollups + Redis cache |
| Filtered drill-down | < 1s | Columnar scans with partition pruning |
| Period-over-period | < 2s | Materialised comparison views |
| What-if simulation | < 3s | Cached model + lightweight inference |
| Full model retrain | < 30min | Background job, never blocking UI |
| Report generation | < 60s | Async with notification on completion |

### Data Volumes by Level

| Level | Expected Volume | Storage Strategy |
|-------|----------------|-----------------|
| 1-2 | Millions of rows | PostgreSQL → migrate to ClickHouse at 10M+ |
| 3 | Hundreds of millions | ClickHouse with daily rollups for model training |
| 4 | Billions | ClickHouse with tiered aggregation (raw → daily → weekly → monthly) |
| 5 | Trillions | Distributed ClickHouse cluster + Kafka streaming + cold archival |

---

## Development Conventions

### Frontend

- **shadcn/ui** for all UI components — do not introduce new component libraries
- **Tailwind CSS** only — no inline styles, no separate CSS files
- Follow existing page layout patterns for consistency
- Charts must handle large datasets — use virtualisation and progressive loading
- All monetary values formatted as **ZAR** (South African Rand) with `R` prefix
- Dark mode must be supported consistently

### Backend

- **Supabase** remains the transactional backend (auth, profiles, subscriptions)
- Analytical queries route to the **columnar engine** (ClickHouse/Druid) once available
- Python data science services run as **separate microservices** (FastAPI)
- All API endpoints must be **authenticated** and **rate-limited**
- Background jobs (model training, report generation, ETL) use the **orchestration layer**

### Data

- All data tables have **soft deletes** (`deleted_at`) — never hard delete
- Audit columns (`created_at`, `updated_at`, `deleted_at`) on every table
- All queries scoped to **authenticated user's tenant** — multi-tenancy from day one
- **RLS policies** enforced at database level, not application level
- SKU normalisation runs on **every data ingestion** — maintain a master product catalogue
- Raw data always preserved in object storage before transformation

### AI/ML

- GPT-4o for **narrative generation** and **NLQ** — follow existing "Generate Insights" pattern
- Statistical models (MMM, forecasting, optimisation) in **Python** — never in-browser
- All models must expose **confidence intervals** — no point predictions without uncertainty
- Model versions tracked in **registry** with performance metrics
- Retraining triggered by **data events** or **schedule**, never manual

### Naming

- React components: PascalCase (`ProductsPage`, `WhatIfSimulator`)
- Files: kebab-case for utilities, PascalCase for components
- Database tables: snake_case (`sell_out_data`, `campaign_data`)
- API endpoints: kebab-case (`/api/model-predict`, `/api/budget-optimise`)
- Supabase functions: snake_case

---

## South African Context

This platform serves the **South African FMCG market**. Always apply this context:

- **Currency:** ZAR (South African Rand) — format with `R` prefix (e.g., R1,250,000)
- **Retailers:** Pick n Pay, Checkers/Shoprite/ShopRite Group, Woolworths, Spar, Makro, Game, Clicks, Dis-Chem
- **Provinces:** Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape
- **Seasonality:** Festive season (Nov-Jan), Back-to-School (Jan-Feb), Easter, Heritage Month (Sep)
- **Media channels:** Meta, Google, TikTok, DStv/Multichoice, OOH, in-store (gondola ends, shelf talkers, loyalty programmes)
- **Data sources:** Retailer portals, Nielsen, IRI, Euromonitor, ad platform APIs

---

## Pricing Tiers (SaaS)

| Level | Tier | Monthly Price |
|-------|------|--------------|
| 2 | Starter | $999 - $2,999 |
| 3 | Professional | $2,999 - $4,999 |
| 4 | Enterprise | $4,999 - $9,999 |
| 5 | Enterprise+ | $10,000+ |

Stripe handles billing. Subscription level gates feature access. Ensure all new features check the user's subscription tier before rendering.

---

## Implementation Roadmap

| Phase | Focus | Timeline | Level |
|-------|-------|----------|-------|
| **Phase 1** | Complete Level 2: period-over-period, attribution, anomaly detection, SKU normalisation | Q1-Q2 2026 | Level 2 |
| **Phase 2** | Build MMM + what-if simulator, campaign planner, scenario builder | Q3-Q4 2026 | Level 3 |
| **Phase 3** | Optimal allocator, incrementality engine, executive dashboard | Q1-Q2 2027 | Level 4 |
| **Phase 4** | Always-on learning, auto-optimisation, real-time ingestion, API integrations | Q3-Q4 2027 | Level 5 |

### Current Priority: Demo Readiness + Level 2 Completion

Clients are expecting a demo. Immediate priorities:

1. **Visual polish** — all existing Level 1 pages must render cleanly with real data
2. **Data accuracy** — KPIs and charts must be correct and consistent
3. **AI insights quality** — professional, actionable narrative generation
4. **Upload reliability** — CSV/XLSX upload must work flawlessly in live demos
5. **Performance** — sub-second dashboard loads, even as data grows
6. **Level 2 features** — period-over-period and cross-retailer benchmarking are the highest-value demo additions
7. **Error handling** — no broken states visible during demo; graceful fallbacks everywhere

---

## Do NOT

- Remove or modify existing **RLS policies** without explicit instruction
- Change **authentication flows** without explicit instruction
- Modify **Stripe webhook handlers** without explicit instruction
- Introduce new UI frameworks (stick with **shadcn/ui + Tailwind**)
- Run analytical models **in the browser** — always server-side
- Store raw data in **PostgreSQL** beyond practical limits — migrate to columnar
- Show predictions **without confidence intervals**
- Hard delete anything — always **soft delete**
- Bypass **tenant scoping** on any query
- Ignore **SKU normalisation** — dirty product names break every downstream analysis
