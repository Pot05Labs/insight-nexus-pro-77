ALTER TABLE public.data_uploads ADD COLUMN IF NOT EXISTS data_type text;
ALTER TABLE public.data_uploads ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);