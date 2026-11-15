-- SMFTA AI Pro V2 Quota & Usage Persistence Migration
-- Table: smfta_v2_usage
CREATE TABLE IF NOT EXISTS public.smfta_v2_usage (
  user_id text NOT NULL,
  date_riyadh text NOT NULL,
  used_by_model jsonb NOT NULL DEFAULT '{}'::jsonb,
  testing_used_by_model jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT smfta_v2_usage_pkey PRIMARY KEY (user_id, date_riyadh)
);

-- Table: smfta_v2_quota_config
CREATE TABLE IF NOT EXISTS public.smfta_v2_quota_config (
  user_id text PRIMARY KEY,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.smfta_v2_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smfta_v2_quota_config ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS Policies
CREATE POLICY "Users can view their own V2 usage records"
  ON public.smfta_v2_usage
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert or update their own V2 usage records"
  ON public.smfta_v2_usage
  FOR ALL
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can view their own V2 quota config"
  ON public.smfta_v2_quota_config
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert or update their own V2 quota config"
  ON public.smfta_v2_quota_config
  FOR ALL
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');
