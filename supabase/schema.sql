-- Pacebook : schéma Supabase (Postgres). À exécuter une fois dans « SQL Editor ».
-- Une ligne par utilisateur ; chacun ne voit et n'écrit que la sienne (Row Level Security).

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,   -- compte supprimé => données supprimées
  doc        jsonb not null default '{}'::jsonb,                              -- Pacebook (profil, suivi, coches...) : données de santé
  consent    jsonb,                                                           -- accord horodaté : {cgu, privacy, health, age15, at}
  updated_at timestamptz not null default now(),
  constraint doc_is_object   check (jsonb_typeof(doc) = 'object'),
  constraint doc_max_size    check (octet_length(doc::text) <= 1500000),      -- 1,5 Mo au plus
  -- forme stricte : vrais booléens JSON, vraies dates, horodatage texte, EXACTEMENT ces 6 clés (empêche un consentement falsifié écrit directement via l'API REST)
  constraint consent_shape   check (consent is null or (
      jsonb_typeof(consent) = 'object'
      and octet_length(consent::text) <= 1000
      and jsonb_typeof(consent -> 'terms')  = 'boolean' and (consent -> 'terms')  = 'true'::jsonb   -- CGU + confidentialité lues et acceptées
      and jsonb_typeof(consent -> 'health') = 'boolean' and (consent -> 'health') = 'true'::jsonb   -- consentement explicite aux données de santé (art. 9.2.a)
      and jsonb_typeof(consent -> 'age15')  = 'boolean' and (consent -> 'age15')  = 'true'::jsonb
      and (consent ->> 'cgu')     ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
      and (consent ->> 'privacy') ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
      and jsonb_typeof(consent -> 'at') = 'string'
      and consent ?& array['terms','health','age15','cgu','privacy','at']
      and consent - array['terms','health','age15','cgu','privacy','at'] = '{}'::jsonb))   -- aucune clé en trop (exactement ces 6)
);

-- NB : les anciens comptes de test créés avant la colonne « terms » doivent être supprimés ou mis à jour.
comment on table public.user_data is 'Pacebook : une ligne par utilisateur, protégée par RLS. Contient des données de santé (art. 9 RGPD).';

-- Réapplique les contraintes sur une base DÉJÀ existante (« create table if not exists » ne les met pas à jour) : rejouer ce fichier durcit alors le consentement et la taille.
alter table public.user_data drop constraint if exists consent_shape;
alter table public.user_data add constraint consent_shape check (consent is null or (
    jsonb_typeof(consent) = 'object'
    and octet_length(consent::text) <= 1000
    and jsonb_typeof(consent -> 'terms')  = 'boolean' and (consent -> 'terms')  = 'true'::jsonb
    and jsonb_typeof(consent -> 'health') = 'boolean' and (consent -> 'health') = 'true'::jsonb
    and jsonb_typeof(consent -> 'age15')  = 'boolean' and (consent -> 'age15')  = 'true'::jsonb
    and (consent ->> 'cgu')     ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
    and (consent ->> 'privacy') ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
    and jsonb_typeof(consent -> 'at') = 'string'
    and consent ?& array['terms','health','age15','cgu','privacy','at']
    and consent - array['terms','health','age15','cgu','privacy','at'] = '{}'::jsonb));   -- aucune clé en trop (exactement ces 6)
alter table public.user_data drop constraint if exists doc_is_object;
alter table public.user_data add constraint doc_is_object check (jsonb_typeof(doc) = 'object');
alter table public.user_data drop constraint if exists doc_max_size;
alter table public.user_data add constraint doc_max_size check (octet_length(doc::text) <= 1500000);

-- Journal d'accord (preuve du consentement, art. 7.1) : une ligne par enregistrement, jamais lisible ni modifiable par le client.
create table if not exists public.consent_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consent jsonb not null,
  at      timestamptz not null default now()
);
alter table public.consent_log enable row level security;
alter table public.consent_log force row level security;
revoke all on public.consent_log from anon, authenticated;   -- réservé au serveur (service_role / postgres)

-- Horodatage SERVEUR du consentement + journalisation : le client ne décide pas de consent.at (anti-falsification).
create or replace function public.stamp_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.consent is not null and (tg_op = 'INSERT' or new.consent is distinct from old.consent) then
    new.consent := jsonb_set(new.consent, '{at}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
    insert into public.consent_log (user_id, consent) values (new.user_id, new.consent);
    -- RGPD « consentement périmé » ACTIVÉ : refuse un accord qui ne porte pas la version courante des textes.
    -- À CHAQUE changement des CGU / de la politique, aligne cette date sur CONSENT_V (public/auth.js, actuellement 2026-10-10) :
    if new.consent ->> 'cgu' <> '2026-10-10' or new.consent ->> 'privacy' <> '2026-10-10' then
      raise exception 'consentement : version des textes perimee' using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_consent() from public, anon, authenticated;
drop trigger if exists user_data_stamp_consent on public.user_data;
create trigger user_data_stamp_consent before insert or update on public.user_data
  for each row execute function public.stamp_consent();

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
  if coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'false' then raise exception 'compte anonyme' using errcode = '28000'; end if;
  -- Option (action sensible) : exiger une session récente. Décommente pour forcer une reconnexion de moins de 5 min avant suppression :
  -- if coalesce((select (auth.jwt() ->> 'iat')::bigint), 0) < extract(epoch from now())::bigint - 300 then
  --   raise exception 'reconnecte-toi pour supprimer ton compte' using errcode = '28000'; end if;
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
