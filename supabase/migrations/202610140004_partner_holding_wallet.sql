insert into public.wallets (name, balance)
select 'Titipan ke Pasangan - Dana Saya', 0
where not exists (
  select 1
  from public.wallets
  where lower(name) = lower('Titipan ke Pasangan - Dana Saya')
);
