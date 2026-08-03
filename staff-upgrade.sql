-- 果來好甜：員工管理與權限升級
-- 請整段貼到 Supabase SQL Editor 執行一次。

alter table public.staff_profiles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists staff_profiles_email_unique on public.staff_profiles(lower(email));

-- 避免 RLS 自我查詢造成遞迴，改由安全函式判斷目前員工。
create or replace function public.get_my_staff_profile()
returns table(user_id uuid,email text,display_name text,role text,is_active boolean)
language sql stable security definer set search_path=public,auth as $$
  select s.user_id,s.email,s.display_name,s.role,s.is_active
  from public.staff_profiles s where s.user_id=auth.uid();
$$;

create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path=public as $$
  select role from public.staff_profiles where user_id=auth.uid() and is_active=true;
$$;

create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff_profiles where user_id=auth.uid() and is_active=true);
$$;

revoke all on function public.get_my_staff_profile() from public;
grant execute on function public.get_my_staff_profile() to authenticated;
revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;
revoke all on function public.is_active_staff() from public;
grant execute on function public.is_active_staff() to authenticated;

-- 修正員工表 RLS。
drop policy if exists "staff can read profiles" on public.staff_profiles;
drop policy if exists "owner can manage staff" on public.staff_profiles;
create policy "active staff can read profiles" on public.staff_profiles
for select to authenticated using (public.is_active_staff());

-- 老闆透過 RPC 管理員工，前端不直接修改表格。
create or replace function public.list_staff_members()
returns table(user_id uuid,email text,display_name text,role text,is_active boolean,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if public.current_staff_role()<>'owner' then raise exception '只有老闆可以查看員工名單'; end if;
  return query select s.user_id,s.email,s.display_name,s.role,s.is_active,s.created_at,s.updated_at from public.staff_profiles s order by s.created_at;
end $$;

create or replace function public.upsert_staff_member(p_email text,p_display_name text,p_role text,p_is_active boolean default true)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_user_id uuid;
begin
  if public.current_staff_role()<>'owner' then raise exception '只有老闆可以管理員工'; end if;
  if p_role not in ('owner','manager','order_staff') then raise exception '權限設定不正確'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email));
  if v_user_id is null then raise exception '找不到此 Email 的登入帳號'; end if;
  insert into public.staff_profiles(user_id,email,display_name,role,is_active,updated_at)
  values(v_user_id,lower(trim(p_email)),trim(p_display_name),p_role,p_is_active,now())
  on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,is_active=excluded.is_active,updated_at=now();
end $$;

create or replace function public.update_staff_member(p_user_id uuid,p_display_name text,p_role text,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if public.current_staff_role()<>'owner' then raise exception '只有老闆可以管理員工'; end if;
  if p_role not in ('owner','manager','order_staff') then raise exception '權限設定不正確'; end if;
  if p_user_id=auth.uid() and (p_role<>'owner' or p_is_active=false) then raise exception '不能停用自己或移除自己的老闆權限'; end if;
  update public.staff_profiles set display_name=trim(p_display_name),role=p_role,is_active=p_is_active,updated_at=now() where user_id=p_user_id;
  if not found then raise exception '找不到員工資料'; end if;
end $$;

revoke all on function public.list_staff_members() from public;
grant execute on function public.list_staff_members() to authenticated;
revoke all on function public.upsert_staff_member(text,text,text,boolean) from public;
grant execute on function public.upsert_staff_member(text,text,text,boolean) to authenticated;
revoke all on function public.update_staff_member(uuid,text,text,boolean) from public;
grant execute on function public.update_staff_member(uuid,text,text,boolean) to authenticated;

-- 後台資料權限：老闆、管理員可管理商品與設定；所有啟用員工可看訂單。
drop policy if exists "seller manages products" on public.products;
create policy "owner manager products" on public.products for all to authenticated
using (public.current_staff_role() in ('owner','manager'))
with check (public.current_staff_role() in ('owner','manager'));

drop policy if exists "seller manages settings" on public.store_settings;
create policy "owner manager settings" on public.store_settings for all to authenticated
using (public.current_staff_role() in ('owner','manager'))
with check (public.current_staff_role() in ('owner','manager'));

drop policy if exists "seller reads orders" on public.orders;
create policy "active staff reads orders" on public.orders for select to authenticated using (public.is_active_staff());
drop policy if exists "seller reads order items" on public.order_items;
create policy "active staff reads order items" on public.order_items for select to authenticated using (public.is_active_staff());

-- 訂單狀態 RPC 也必須確認是啟用員工。
create or replace function public.update_order_status(p_order_id text,p_new_status text)
returns void language plpgsql security definer set search_path=public as $$
declare old_status text; it record;
begin
 if not public.is_active_staff() then raise exception '此帳號沒有後台權限'; end if;
 select status into old_status from orders where id=p_order_id for update;
 if old_status is null then raise exception '找不到訂單'; end if;
 if old_status='等待報價' and p_new_status in('已確認','未取') then
   for it in select * from order_items where order_id=p_order_id loop
     update products set stock=stock-it.qty where id=it.product_id and stock>=it.qty;
     if not found then raise exception '庫存不足：%',it.name; end if;
   end loop;
 end if;
 update orders set status=p_new_status where id=p_order_id;
end $$;
