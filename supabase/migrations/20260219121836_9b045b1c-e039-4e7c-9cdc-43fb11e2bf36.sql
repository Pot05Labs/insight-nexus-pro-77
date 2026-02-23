
CREATE TABLE public.waitlist_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  company_name text NOT NULL,
  email text NOT NULL,
  selected_plan text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form)
CREATE POLICY "Anyone can insert waitlist leads"
  ON public.waitlist_leads
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated admins can read
CREATE POLICY "Admins can view waitlist leads"
  ON public.waitlist_leads
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
