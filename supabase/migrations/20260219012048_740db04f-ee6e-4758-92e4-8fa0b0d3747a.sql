
-- Storage bucket for uploaded files
INSERT INTO storage.buckets (id, name, public) VALUES ('data-uploads', 'data-uploads', false);

-- Storage policies
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'data-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'data-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
USING (bucket_id = 'data-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Data uploads tracking table
CREATE TABLE public.data_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- csv, xlsx, pptx
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded, parsing, parsed, harmonizing, harmonized, error
  row_count INT,
  column_names JSONB, -- detected column names
  column_mapping JSONB, -- AI-suggested column mapping
  source_name TEXT, -- retailer/platform name
  source_type TEXT, -- retailer, ad_platform, etc.
  date_range_start DATE,
  date_range_end DATE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own uploads"
ON public.data_uploads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploads"
ON public.data_uploads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads"
ON public.data_uploads FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploads"
ON public.data_uploads FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_data_uploads_updated_at
BEFORE UPDATE ON public.data_uploads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Harmonized sales data
CREATE TABLE public.harmonized_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  upload_id UUID REFERENCES public.data_uploads(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sku TEXT,
  product_name TEXT,
  channel TEXT, -- Amazon, Walmart, Target, DTC, etc.
  revenue NUMERIC(14,2) DEFAULT 0,
  units_sold INT DEFAULT 0,
  returns INT DEFAULT 0,
  cost NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.harmonized_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sales"
ON public.harmonized_sales FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sales"
ON public.harmonized_sales FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sales"
ON public.harmonized_sales FOR DELETE
USING (auth.uid() = user_id);

-- Campaign performance data
CREATE TABLE public.campaign_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  upload_id UUID REFERENCES public.data_uploads(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  platform TEXT NOT NULL, -- Meta, Google, TikTok, Amazon Ads
  campaign_name TEXT,
  ad_group TEXT,
  spend NUMERIC(14,2) DEFAULT 0,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  revenue NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
ON public.campaign_data FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
ON public.campaign_data FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
ON public.campaign_data FOR DELETE
USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX idx_harmonized_sales_user_date ON public.harmonized_sales(user_id, date);
CREATE INDEX idx_harmonized_sales_channel ON public.harmonized_sales(user_id, channel);
CREATE INDEX idx_campaign_data_user_date ON public.campaign_data(user_id, date);
CREATE INDEX idx_campaign_data_platform ON public.campaign_data(user_id, platform);
CREATE INDEX idx_data_uploads_user ON public.data_uploads(user_id);
