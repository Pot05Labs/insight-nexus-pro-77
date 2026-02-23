# DataHarmonize — Data Harmonization & Insights Platform

## Overview

A modern SaaS platform where brands and agencies upload sales and campaign data from multiple sources, and an AI engine harmonizes, analyzes, and surfaces actionable insights — all in one unified dashboard.

---

## 1. Authentication & User Management

- Email/password signup and login with Supabase Auth
- User profiles with company name, role (brand vs. agency), and avatar
- Role-based access: Admin, Analyst, Viewer
- Subscription gating via Stripe (Free trial → paid plans)

## 2. Workspace & Organization

- Multi-tenant workspaces so agencies can manage multiple brand clients
- Each workspace has its own data, dashboards, and team members
- Invite team members with role-based permissions

## 3. Data Ingestion Hub

- **File Upload**: Drag-and-drop zone supporting CSV, Excel (.xlsx), and PowerPoint (.pptx) files
- **Google Sheets**: Paste a link to pull data from shared Google Sheets
- **API Integrations**: Amazon, Walmart, Meta Ads, Google Ads, TikTok, etc.
- Automatic file parsing and column detection with preview before confirming import
- Data source tagging (retailer name, platform, date range, SKU mapping)

## 4. Data Harmonization Engine

- AI-powered column mapping: automatically detect and align fields across different retailer/platform formats (e.g., "Revenue" vs "Net Sales" vs "Total Sales")
- SKU normalization: match product identifiers across retailers
- Date and currency standardization
- Conflict resolution UI when the AI isn't confident about a mapping
- Harmonized data stored in a unified schema for cross-source analysis

## 5. AI-Powered Analysis & Insights

- **Performance Summary**: Auto-generated executive summary of sales trends, top/bottom SKUs, campaign ROI across all ingested data
- **Cross-Channel Attribution**: Connect media spend (by platform and campaign) to sales lift across retailers — visual funnel from impressions → clicks → conversions → sales
- **Anomaly Detection**: Flag unexpected spikes or drops in sales, ROAS, CTR, or other KPIs with explanations of possible causes
- **Chat with Data**: Natural language Q&A — ask questions like "Which SKU had the best ROAS on Meta last month?" and get instant answers with supporting charts

## 6. Dashboard & Visualization

- **Home Dashboard**: KPI cards (total revenue, ad spend, ROAS, top SKUs), trend charts, and recent alerts
- **Sales Explorer**: Filter and drill into sales by retailer, SKU, time period with comparison views
- **Campaign Performance**: Spend vs. results breakdown by platform, campaign, and creative
- **Custom Reports**: Save filtered views as shareable reports (PDF export)
- Modern SaaS aesthetic — clean layout, good data density, smooth interactions

## 7. Subscription & Billing (Stripe)

- Free trial with limited uploads/analyses
- Tiered plans: Starter (small brands), Growth (mid-market), Enterprise (agencies with multiple clients)
- Stripe Checkout for subscriptions, billing portal for plan management

## 8. Technical Architecture

- **Frontend**: React + TypeScript + Tailwind + shadcn/ui + Recharts
- **Backend**: Lovable Cloud (Supabase) — database, auth, edge functions, storage
- **AI**: Lovable AI gateway for data analysis, harmonization suggestions, and chat
- **File Storage**: Supabase Storage for uploaded files
- **File Parsing**: Edge functions to parse CSV/Excel/PPTX server-side

---

## Implementation Phases

### Phase 1 — Foundation

- Auth (signup/login), user profiles, workspace setup
- File upload (CSV/Excel) with parsing and preview
- Basic database schema for harmonized sales & campaign data

### Phase 2 — Harmonization & Core Dashboard

- AI-powered column mapping and SKU normalization
- Home dashboard with KPI cards and trend charts
- Sales and campaign data explorer views

### Phase 3 — AI Insights

- Performance summary generation
- Anomaly detection with alerts
- Cross-channel attribution view
- Chat with data feature

### Phase 4 — Monetization & Polish

- Stripe subscription integration
- PPTX and Google Sheets ingestion
- PDF report export
- Team invites and permissions
- API integration placeholders for future connectors