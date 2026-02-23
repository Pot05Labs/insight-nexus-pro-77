-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_uploads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sell_out_data;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
