-- Pacebook : schéma Supabase (Postgres). À exécuter une fois dans « SQL Editor ».
-- Une ligne par utilisateur ; chacun ne voit et n'écrit que la sienne (Row Level Security).

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,   -- compte supprimé => données supprimées
  doc        jsonb not null default '{}'::jsonb,                              -- Pacebook (profil, suivi, coches...) : données de santé
  consent    jsonb,                                                           -- accord horodaté : {cgu, privacy, health, age15, at}
  updated_at timestamptz not null default now(),
  constraint doc_is_object   check (jsonb_typeof(doc) = 'object'),
  constraint doc_max_size    check (octet_length(doc::text) <= 1500000),      -- 1,5 Mo au plus
  constraint consent_shape   check (consent is null or (
      jsonb_typeof(consent) = 'object'
      and octet_length(consent::text) <= 1000
      and consent ->> 'terms' = 'true'     -- CGU + confidentialité lues et acceptées
      and consent ->> 'health' = 'true'    -- consentement explicite aux données de santé (art. 9.2.a)
      and consent ->> 'age15' = 'true'
      and (consent ->> 'cgu') ~ '^\d{4}-\d{2}-\d{2}$'
      and (consent ->> 'privacy') ~ '^\d{4}-\d{2}-\d{2}$'
      and (consent ->> 'at') is not null))
);

-- NB : les anciens comptes de test créés avant la colonne « terms » doivent être supprimés ou mis à jour.
comment on table public.user_data is 'Pacebook : une ligne par utilisateur, protégée par RLS. Contient des données de santé (art. 9 RGPD).';

alter table public.user_data enable row level security;
alter table public.user_data force row level security;

-- aucun accès pour les visiteurs anonymes
revoke all on public.user_data from anon;
revoke all on public.user_data from authenticated;
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

-- Comptes anonymes exclus (désactive aussi « Allow anonymous sign-ins » dans Authentication > Providers).
-- lecture / suppression : sa propre ligne seulement
create policy "user_data_select_own" on public.user_data for select to authenticated
  using (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

create policy "user_data_delete_own" on public.user_data for delete to authenticated
  using (user_id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

-- création de la ligne : seulement avec l'accord enregistré (le client ne la crée qu'à l'acceptation)
create policy "user_data_insert_own" on public.user_data for insert to authenticated
  with check (user_id = (select auth.uid()) and consent is not null
              and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

-- mise à jour : seulement d'une ligne EXISTANTE qui porte un accord (un appareil resté connecté ne recrée rien après un retrait)
create policy "user_data_update_own" on public.user_data for update to authenticated
  using (user_id = (select auth.uid()) and consent is not null
         and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false')
  with check (user_id = (select auth.uid()) and consent is not null
              and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

-- horodatage serveur (le client ne décide pas de updated_at)
create or replace function public.touch_user_data() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.touch_user_data();

-- Droit à l'effacement : l'utilisateur supprime LUI-MÊME son compte (et, par cascade, ses données).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = uid;   -- cascade sur public.user_data
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Purge des comptes inactifs (durée annoncée dans la politique de confidentialité, config.js > INACTIVITE_MOIS).
-- Inactif = ni connexion ni écriture de données depuis N mois. Réservée au rôle postgres / cron (aucun client ne peut l'appeler).
create or replace function public.purge_inactive_accounts(months integer default 24) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if months < 6 then raise exception 'months trop petit (6 au moins)'; end if;
  with gone as (
    delete from auth.users u
     where greatest(coalesce(u.last_sign_in_at, u.created_at),
                    coalesce((select max(s.refreshed_at) from auth.sessions s where s.user_id = u.id), u.created_at),
                    coalesce((select d.updated_at from public.user_data d where d.user_id = u.id), u.created_at))
           < now() - make_interval(months => months)
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.purge_inactive_accounts(integer) from public, anon, authenticated;

-- Planification hebdomadaire (extension pg_cron : Database > Extensions > pg_cron), à décommenter après avoir choisi la durée :
-- select cron.schedule('purge-comptes-inactifs', '0 3 * * 0', $$ select public.purge_inactive_accounts(24) $$);

-- Rate limiting : voir README (Authentication > Rate Limits, CAPTCHA) ; la taille de ligne est bornée par doc_max_size.
