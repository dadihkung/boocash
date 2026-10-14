alter table public.transactions
  add column if not exists owner_scope text not null default 'shared';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_owner_scope_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_owner_scope_check
      check (owner_scope in ('shared', 'me', 'partner'));
  end if;
end;
$$;

drop function if exists public.record_financial_transaction(bigint, numeric, text, text, date, text, bigint, bigint);

create function public.record_financial_transaction(
  p_wallet_id bigint,
  p_amount numeric,
  p_transaction_type text,
  p_category text,
  p_created_at date,
  p_description text,
  p_target_wallet_id bigint default null,
  p_goal_id bigint default null,
  p_owner_scope text default 'shared'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  transfer_group_id uuid;
  signed_amount numeric;
  goal_name text;
  deposit_label text;
begin
  if p_amount <= 0 then
    raise exception 'Transaction amount must be greater than zero';
  end if;
  if p_owner_scope not in ('shared', 'me', 'partner') then
    raise exception 'Unsupported owner scope: %', p_owner_scope;
  end if;

  if p_transaction_type = 'expense' and p_category in ('Wishlist Savings', 'Emergency Savings') then
    if p_target_wallet_id is null or p_target_wallet_id = p_wallet_id then
      raise exception 'A savings deposit requires a different savings wallet';
    end if;
    if p_goal_id is null then
      raise exception 'A savings deposit requires a savings goal';
    end if;

    select item_name into goal_name
    from public.savings_goals
    where id = p_goal_id;
    if not found then
      raise exception 'Savings goal % not found', p_goal_id;
    end if;

    deposit_label := case
      when p_category = 'Emergency Savings' then 'Dana darurat: '
      else 'Setoran wishlist: '
    end;
    transfer_group_id := gen_random_uuid();

    insert into public.transactions (
      wallet_id, amount, category, created_at, description, transfer_id, savings_goal_id, owner_scope
    ) values (
      p_wallet_id,
      -p_amount,
      'Transfer',
      p_created_at,
      deposit_label || goal_name || ' (keluar)' || case when nullif(p_description, '') is null then '' else ' - ' || p_description end,
      transfer_group_id,
      p_goal_id,
      p_owner_scope
    );

    insert into public.transactions (wallet_id, amount, category, created_at, description, transfer_id, owner_scope)
    values (
      p_target_wallet_id,
      p_amount,
      'Transfer',
      p_created_at,
      deposit_label || goal_name || ' (masuk)' || case when nullif(p_description, '') is null then '' else ' - ' || p_description end,
      transfer_group_id,
      p_owner_scope
    );
    return;
  end if;

  if p_transaction_type = 'transfer' then
    if p_target_wallet_id is null or p_target_wallet_id = p_wallet_id then
      raise exception 'A transfer requires two different wallets';
    end if;
    transfer_group_id := gen_random_uuid();
    insert into public.transactions (wallet_id, amount, category, created_at, description, transfer_id, owner_scope)
    values
      (p_wallet_id, -p_amount, 'Transfer', p_created_at, coalesce(nullif(p_description, ''), 'Transfer keluar'), transfer_group_id, p_owner_scope),
      (p_target_wallet_id, p_amount, 'Transfer', p_created_at, coalesce(nullif(p_description, ''), 'Transfer masuk'), transfer_group_id, p_owner_scope);
    return;
  end if;

  if p_transaction_type not in ('expense', 'income') then
    raise exception 'Unsupported transaction type: %', p_transaction_type;
  end if;

  signed_amount := case when p_transaction_type = 'expense' then -p_amount else p_amount end;
  insert into public.transactions (wallet_id, amount, category, created_at, description, savings_goal_id, owner_scope)
  values (
    p_wallet_id,
    signed_amount,
    p_category,
    p_created_at,
    p_description,
    case when p_category in ('Wishlist Savings', 'Emergency Savings') then p_goal_id else null end,
    p_owner_scope
  );
end;
$$;