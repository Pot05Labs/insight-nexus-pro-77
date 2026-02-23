
-- Add audit columns and soft delete to data tables

-- sell_out_data: add updated_at, created_by, deleted_at
ALTER TABLE public.sell_out_data
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- campaign_data_v2: add updated_at, created_by, deleted_at
ALTER TABLE public.campaign_data_v2
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- campaign_data: add updated_at, created_by, deleted_at
ALTER TABLE public.campaign_data
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- computed_metrics: add updated_at, created_by, deleted_at
ALTER TABLE public.computed_metrics
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- chat_messages: add updated_at, deleted_at
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- narrative_reports: add updated_at, deleted_at
ALTER TABLE public.narrative_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- pipeline_runs: add updated_at, deleted_at
ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- file_uploads: add updated_at, deleted_at
ALTER TABLE public.file_uploads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Create updated_at trigger function (if not exists already we recreate)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers to all data tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'sell_out_data', 'campaign_data_v2', 'campaign_data',
    'computed_metrics', 'chat_messages', 'narrative_reports',
    'pipeline_runs', 'file_uploads', 'data_uploads'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', tbl);
  END LOOP;
END;
$$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sell_out_data_user_id ON public.sell_out_data(user_id);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_date ON public.sell_out_data(date);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_brand ON public.sell_out_data(brand);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_category ON public.sell_out_data(category);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_retailer ON public.sell_out_data(retailer);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_region ON public.sell_out_data(region);
CREATE INDEX IF NOT EXISTS idx_sell_out_data_project ON public.sell_out_data(project_id);

CREATE INDEX IF NOT EXISTS idx_campaign_data_v2_user_id ON public.campaign_data_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_data_v2_project ON public.campaign_data_v2(project_id);

CREATE INDEX IF NOT EXISTS idx_data_uploads_user_id ON public.data_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_data_uploads_project ON public.data_uploads(project_id);

CREATE INDEX IF NOT EXISTS idx_computed_metrics_user_id ON public.computed_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_computed_metrics_project ON public.computed_metrics(project_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON public.chat_messages(project_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
