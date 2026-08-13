revoke execute on function public.app_user_login(text,text) from public, anon, authenticated;
revoke execute on function public.upsert_app_user(text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.app_user_login(text,text) to service_role;
grant execute on function public.upsert_app_user(text,text,text,text,text,text,text,text,boolean) to service_role;
notify pgrst, 'reload schema';