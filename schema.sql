-- 果來好甜正式版 Supabase 資料表與權限
-- 請整段貼到 Supabase SQL Editor 執行一次。

create extension if not exists pgcrypto;

create table if not exists products(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  price numeric not null check(price>=0),
  stock integer not null default 0 check(stock>=0),
  emoji text default '🍎',
  description text default '',
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);
create table if not exists store_settings(
  id integer primary key default 1,
  location text not null,
  hours text not null,
  open boolean default true,
  updated_at timestamptz default now()
);
create table if not exists orders(
  id text primary key,
  name text not null,
  phone text not null,
  line_name text default '',
  pickup_time text not null,
  method text not null,
  address text default '',
  note text default '',
  status text not null,
  total numeric not null default 0,
  created_at timestamptz default now()
);
create table if not exists order_items(
  id bigint generated always as identity primary key,
  order_id text references orders(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  unit text not null,
  price numeric not null,
  qty integer not null,
  emoji text default '🍎'
);

insert into store_settings(id,location,hours,open)
values(1,'📍 板橋重慶黃昏市場','取貨時間 14:00–19:30｜商品限當日取貨',true)
on conflict(id) do nothing;

alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table store_settings enable row level security;

-- 移除舊版不安全的公開讀寫規則
 drop policy if exists "public read products" on products;
 drop policy if exists "public read settings" on store_settings;
 drop policy if exists "public read orders demo" on orders;
 drop policy if exists "public read items demo" on order_items;
 drop policy if exists "public product write demo" on products;
 drop policy if exists "public settings write demo" on store_settings;
 drop policy if exists "public order insert" on orders;
 drop policy if exists "public item insert" on order_items;
 drop policy if exists "public order update demo" on orders;
 drop policy if exists "customers read active products" on products;
 drop policy if exists "customers read store settings" on store_settings;
 drop policy if exists "seller manages products" on products;
 drop policy if exists "seller manages settings" on store_settings;
 drop policy if exists "seller reads orders" on orders;
 drop policy if exists "seller reads order items" on order_items;

-- 客人只能讀商品與店家設定
create policy "customers read active products" on products
for select to anon, authenticated using (true);
create policy "customers read store settings" on store_settings
for select to anon, authenticated using (true);

-- 登入的賣家才能管理後台資料
create policy "seller manages products" on products
for all to authenticated using (true) with check (true);
create policy "seller manages settings" on store_settings
for all to authenticated using (true) with check (true);
create policy "seller reads orders" on orders
for select to authenticated using (true);
create policy "seller reads order items" on order_items
for select to authenticated using (true);

create or replace function create_reservation(
 p_name text,p_phone text,p_line_name text,p_pickup_time text,p_method text,
 p_address text,p_note text,p_status text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text; v_total numeric:=0; it jsonb; p products%rowtype;
begin
 v_id:='GL'||to_char(now(),'MMDD')||'-'||lpad((floor(random()*999)+1)::text,3,'0');
 while exists(select 1 from orders where id=v_id) loop
   v_id:='GL'||to_char(now(),'MMDD')||'-'||lpad((floor(random()*999)+1)::text,3,'0');
 end loop;
 for it in select * from jsonb_array_elements(p_items) loop
   select * into p from products where id=(it->>'product_id')::uuid and active=true for update;
   if p.id is null or p.stock<(it->>'qty')::int then raise exception '商品庫存不足：%',it->>'name'; end if;
   v_total:=v_total+p.price*(it->>'qty')::int;
 end loop;
 insert into orders(id,name,phone,line_name,pickup_time,method,address,note,status,total)
 values(v_id,p_name,p_phone,p_line_name,p_pickup_time,p_method,p_address,p_note,p_status,v_total);
 for it in select * from jsonb_array_elements(p_items) loop
   select * into p from products where id=(it->>'product_id')::uuid;
   insert into order_items(order_id,product_id,name,unit,price,qty,emoji)
   values(v_id,p.id,p.name,p.unit,p.price,(it->>'qty')::int,p.emoji);
   if p_method='現場自取' then
     update products set stock=stock-(it->>'qty')::int where id=p.id;
   end if;
 end loop;
 return jsonb_build_object('id',v_id,'name',p_name,'phone',p_phone,'pickup_time',p_pickup_time,'method',p_method,'status',p_status,'total',v_total,'created_at',now());
end $$;

create or replace function update_order_status(p_order_id text,p_new_status text)
returns void language plpgsql security definer set search_path = public as $$
declare old_status text; it record;
begin
 if auth.uid() is null then raise exception '請先登入'; end if;
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

revoke all on function create_reservation(text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function create_reservation(text,text,text,text,text,text,text,text,jsonb) to anon,authenticated;
revoke all on function update_order_status(text,text) from public,anon;
grant execute on function update_order_status(text,text) to authenticated;
