
-- Drop the mismatched foreign key constraints that reference file_uploads
-- when the code actually stores data_uploads IDs
ALTER TABLE public.sell_out_data DROP CONSTRAINT IF EXISTS sell_out_data_upload_id_fkey;
ALTER TABLE public.campaign_data_v2 DROP CONSTRAINT IF EXISTS campaign_data_v2_upload_id_fkey;

-- Re-add them pointing to data_uploads
ALTER TABLE public.sell_out_data
  ADD CONSTRAINT sell_out_data_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.data_uploads(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_data_v2
  ADD CONSTRAINT campaign_data_v2_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.data_uploads(id) ON DELETE CASCADE;
