alter table public.transactions
  add column if not exists transfer_id uuid,
  add column if not exists savings_goal_id bigint;

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
    if new.category = 'Wishlist Savings' and new.savings_goal_id is not null then
      new_goal_delta := case when new.amount < 0 then abs(new.amount) else -new.amount end;
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
    if old.category = 'Wishlist Savings' and old.savings_goal_id is not null then
      old_goal_delta := case when old.amount < 0 then abs(old.amount) else -old.amount end;
      update public.savings_goals
      set current_saved = coalesce(current_saved, 0) - old_goal_delta
      where id = old.savings_goal_id;
      if not found then
        raise exception 'Savings goal % not found', old.savings_goal_id;
      end if;
    end if;
    return old;
  elsif old.wallet_id = new.wallet_id then
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

  if old.category = 'Wishlist Savings' and old.savings_goal_id is not null then
    old_goal_delta := case when old.amount < 0 then abs(old.amount) else -old.amount end;
    update public.savings_goals
    set current_saved = coalesce(current_saved, 0) - old_goal_delta
    where id = old.savings_goal_id;
    if not found then
      raise exception 'Savings goal % not found', old.savings_goal_id;
    end if;
  end if;
  if new.category = 'Wishlist Savings' and new.savings_goal_id is not null then
    new_goal_delta := case when new.amount < 0 then abs(new.amount) else -new.amount end;
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

drop trigger if exists transactions_update_wallet_balance on public.transactions;
create trigger transactions_update_wallet_balance
after insert or update or delete on public.transactions
for each row execute function public.apply_transaction_to_wallet();

create or replace function public.record_financial_transaction(
  p_wallet_id bigint,
  p_amount numeric,
  p_transaction_type text,
  p_category text,
  p_created_at date,
  p_description text,
  p_target_wallet_id bigint default null,
  p_goal_id bigint default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  transfer_group_id uuid;
  signed_amount numeric;
begin
  if p_amount <= 0 then
    raise exception 'Transaction amount must be greater than zero';
  end if;

  if p_transaction_type = 'transfer' then
    if p_target_wallet_id is null or p_target_wallet_id = p_wallet_id then
      raise exception 'A transfer requires two different wallets';
    end if;
    transfer_group_id := gen_random_uuid();
    insert into public.transactions (wallet_id, amount, category, created_at, description, transfer_id)
    values
      (p_wallet_id, -p_amount, 'Transfer', p_created_at, coalesce(nullif(p_description, ''), 'Transfer keluar'), transfer_group_id),
      (p_target_wallet_id, p_amount, 'Transfer', p_created_at, coalesce(nullif(p_description, ''), 'Transfer masuk'), transfer_group_id);
    return;
  end if;

  if p_transaction_type not in ('expense', 'income') then
    raise exception 'Unsupported transaction type: %', p_transaction_type;
  end if;

  signed_amount := case when p_transaction_type = 'expense' then -p_amount else p_amount end;
  insert into public.transactions (wallet_id, amount, category, created_at, description, savings_goal_id)
  values (
    p_wallet_id,
    signed_amount,
    p_category,
    p_created_at,
    p_description,
    case when p_category = 'Wishlist Savings' then p_goal_id else null end
  );
end;
$$;

create or replace function public.delete_financial_transaction(p_transaction_id bigint)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_transaction public.transactions%rowtype;
begin
  select * into selected_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction % not found', p_transaction_id;
  end if;

  if selected_transaction.transfer_id is not null then
    delete from public.transactions where transfer_id = selected_transaction.transfer_id;
  else
    delete from public.transactions where id = p_transaction_id;
  end if;
end;
$$;

create or replace function public.set_wallet_balance(
  p_wallet_id bigint,
  p_target_balance numeric,
  p_created_at date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_balance numeric;
  balance_difference numeric;
begin
  select balance into current_balance
  from public.wallets
  where id = p_wallet_id
  for update;

  if not found then
    raise exception 'Wallet % not found', p_wallet_id;
  end if;

  balance_difference := p_target_balance - coalesce(current_balance, 0);
  if balance_difference = 0 then
    return;
  end if;

  insert into public.transactions (wallet_id, amount, category, created_at, description)
  values (p_wallet_id, balance_difference, 'Adjustment', p_created_at, 'Penyesuaian Manual via Aplikasi');
end;
$$;