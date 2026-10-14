alter table public.transactions
  add column if not exists goal_contribution numeric not null default 0;

create or replace function public.apply_transaction_to_wallet()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_goal_delta numeric := 0;
  new_goal_delta numeric := 0;
begin
  if tg_op = 'INSERT' then
    update public.wallets
    set balance = coalesce(balance, 0) + new.amount
    where id = new.wallet_id;
    if not found then
      raise exception 'Wallet % not found', new.wallet_id;
    end if;

    if new.savings_goal_id is not null then
      new_goal_delta := case
        when new.goal_contribution <> 0 then new.goal_contribution
        else -new.amount
      end;
      update public.savings_goals
      set current_saved = coalesce(current_saved, 0) + new_goal_delta
      where id = new.savings_goal_id;
      if not found then
        raise exception 'Savings goal % not found', new.savings_goal_id;
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.wallets
    set balance = coalesce(balance, 0) - old.amount
    where id = old.wallet_id;
    if not found then
      raise exception 'Wallet % not found', old.wallet_id;
    end if;

    if old.savings_goal_id is not null then
      old_goal_delta := case
        when old.goal_contribution <> 0 then old.goal_contribution
        else -old.amount
      end;
      update public.savings_goals
      set current_saved = coalesce(current_saved, 0) - old_goal_delta
      where id = old.savings_goal_id;
      if not found then
        raise exception 'Savings goal % not found', old.savings_goal_id;
      end if;
    end if;
    return old;
  end if;

  if old.wallet_id = new.wallet_id then
    update public.wallets
    set balance = coalesce(balance, 0) + new.amount - old.amount
    where id = new.wallet_id;
    if not found then
      raise exception 'Wallet % not found', new.wallet_id;
    end if;
  else
    update public.wallets
    set balance = coalesce(balance, 0) - old.amount
    where id = old.wallet_id;
    if not found then
      raise exception 'Wallet % not found', old.wallet_id;
    end if;
    update public.wallets
    set balance = coalesce(balance, 0) + new.amount
    where id = new.wallet_id;
    if not found then
      raise exception 'Wallet % not found', new.wallet_id;
    end if;
  end if;

  if old.savings_goal_id is not null then
    old_goal_delta := case
      when old.goal_contribution <> 0 then old.goal_contribution
      else -old.amount
    end;
    update public.savings_goals
    set current_saved = coalesce(current_saved, 0) - old_goal_delta
    where id = old.savings_goal_id;
    if not found then
      raise exception 'Savings goal % not found', old.savings_goal_id;
    end if;
  end if;
  if new.savings_goal_id is not null then
    new_goal_delta := case
      when new.goal_contribution <> 0 then new.goal_contribution
      else -new.amount
    end;
    update public.savings_goals
    set current_saved = coalesce(current_saved, 0) + new_goal_delta
    where id = new.savings_goal_id;
    if not found then
      raise exception 'Savings goal % not found', new.savings_goal_id;
    end if;
  end if;
  return new;
end;
$$;

drop function if exists public.record_financial_transaction(bigint, numeric, text, text, date, text, bigint, bigint, text);

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
    if p_goal_id is null then
      raise exception 'A savings deposit requires a savings goal';
    end if;

    select item_name into goal_name
    from public.savings_goals
    where id = p_goal_id;
    if not found then
      raise exception 'Savings goal % not found', p_goal_id;
    end if;

    if p_category = 'Emergency Savings' then
      insert into public.transactions (
        wallet_id, amount, category, created_at, description, savings_goal_id, goal_contribution, owner_scope
      ) values (
        p_wallet_id,
        0,
        'Emergency Savings',
        p_created_at,
        'Alokasi dana darurat: ' || goal_name || case when nullif(p_description, '') is null then '' else ' - ' || p_description end,
        p_goal_id,
        p_amount,
        p_owner_scope
      );
      return;
    end if;

    if p_target_wallet_id is null or p_target_wallet_id = p_wallet_id then
      raise exception 'A wishlist deposit requires a different savings wallet';
    end if;
    deposit_label := 'Setoran wishlist: ';
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
  insert into public.transactions (wallet_id, amount, category, created_at, description, savings_goal_id, goal_contribution, owner_scope)
  values (
    p_wallet_id,
    signed_amount,
    p_category,
    p_created_at,
    p_description,
    case when p_category = 'Wishlist Savings' then p_goal_id else null end,
    0,
    p_owner_scope
  );
end;
$$;