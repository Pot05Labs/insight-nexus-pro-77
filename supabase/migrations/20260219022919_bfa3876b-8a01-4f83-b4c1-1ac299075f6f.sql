
-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- File uploads table
CREATE TABLE public.file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_format TEXT,
  data_type TEXT,
  status TEXT DEFAULT 'uploaded',
  classification JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Sell-out data
CREATE TABLE public.sell_out_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  date DATE,
  retailer TEXT,
  store_location TEXT,
  region TEXT,
  category TEXT,
  sku TEXT,
  product_name_raw TEXT,
  brand TEXT,
  sub_brand TEXT,
  format_size TEXT,
  units_sold INTEGER,
  units_supplied DECIMAL(12,2),
  revenue DECIMAL(12,2),
  cost DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Campaign data (new version)
CREATE TABLE public.campaign_data_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  campaign_name TEXT,
  flight_start DATE,
  flight_end DATE,
  channel TEXT,
  platform TEXT,
  spend DECIMAL(12,2),
  spend_by_period JSONB,
  impressions INTEGER,
  clicks INTEGER,
  ctr DECIMAL(8,4),
  cpm DECIMAL(8,2),
  conversions INTEGER,
  revenue DECIMAL(12,2),
  total_sales_attributed DECIMAL(12,2),
  total_units_attributed INTEGER,
  extraction_confidence DECIMAL(4,2),
  source_format TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Entity matches (3-tier product matching)
CREATE TABLE public.entity_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sell_out_sku TEXT,
  campaign_product TEXT,
  canonical_product TEXT,
  match_tier INTEGER,
  confidence DECIMAL(4,2),
  reasoning TEXT,
  user_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Computed metrics
CREATE TABLE public.computed_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value DECIMAL(12,4),
  dimensions JSONB,
  computed_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Narrative reports (SignalStack)
CREATE TABLE public.narrative_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_type TEXT DEFAULT 'full',
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Pipeline runs
CREATE TABLE public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  current_stage INTEGER DEFAULT 1,
  status TEXT DEFAULT 'processing',
  stage_details JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sell_out_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_data_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.computed_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can CRUD their own data
CREATE POLICY "Users manage own projects" ON public.projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own file_uploads" ON public.file_uploads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own sell_out_data" ON public.sell_out_data FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own campaign_data_v2" ON public.campaign_data_v2 FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own entity_matches" ON public.entity_matches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own computed_metrics" ON public.computed_metrics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own narrative_reports" ON public.narrative_reports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own pipeline_runs" ON public.pipeline_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', false);

-- Storage policies
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own files" ON storage.objects FOR SELECT USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
