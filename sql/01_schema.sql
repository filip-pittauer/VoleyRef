-- =====================================================================
-- 01_schema.sql – tabulky, zabezpečení (RLS, práva) a profil hráče
-- Vlož celé do Supabase → SQL Editor → Run. Skript jde spustit i opakovaně.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schéma "private": NENÍ zpřístupněné přes Data API, takže na tabulky
-- v něm se z prohlížeče nedá vůbec dostat. Patří sem tajná data
-- (správné odpovědi) a pomocné funkce.
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Otázky – veřejná část (co hráč vidí během kola)
-- ---------------------------------------------------------------------
create table if not exists public.otazky (
  id              integer primary key,
  aktivni         boolean  not null default true,
  kategorie       text     not null check (kategorie in (
                    'podani', 'prijem-nahravka', 'utok', 'blok', 'dotyky-chyby',
                    'rotace-postaveni', 'stridani', 'preruseni-hry', 'signalizace')),
  obtiznost       smallint not null default 1 check (obtiznost between 1 and 3),
  situace         text     not null,
  media           jsonb,
  odpovedi        jsonb    not null,   -- {"A": "…", "B": "…", …}
  pravidlo        text,
  verze_pravidel  text,
  upraveno        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Otázky – tajná část (správná odpověď a vysvětlení)
-- ---------------------------------------------------------------------
create table if not exists private.otazky_reseni (
  otazka_id   integer primary key references public.otazky (id) on delete cascade,
  spravna     text not null check (spravna in ('A', 'B', 'C', 'D')),
  vysvetleni  text
);

-- ---------------------------------------------------------------------
-- Profily hráčů (přezdívka). Řádek vzniká automaticky při registraci.
-- ---------------------------------------------------------------------
create table if not exists public.profily (
  id         uuid primary key references auth.users (id) on delete cascade,
  prezdivka  text not null unique
             check (char_length(prezdivka) between 3 and 20 and prezdivka = trim(prezdivka)),
  vytvoreno  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Odehraná kola. Čas a skóre zapisují jen serverové funkce (02_funkce.sql).
-- uzivatel_id = null → hrál nepřihlášený hráč (do žebříčku se nepočítá).
-- ---------------------------------------------------------------------
create table if not exists public.kola (
  id           uuid primary key default gen_random_uuid(),
  uzivatel_id  uuid references auth.users (id) on delete cascade,
  kategorie    text,                      -- null = všechny kategorie
  otazky       integer[] not null,        -- id otázek v pořadí, jak je hráč dostal
  pocet        smallint  not null,
  zacatek      timestamptz not null default now(),
  konec        timestamptz,               -- null = kolo ještě není odevzdané
  skore        smallint,
  odpovedi     jsonb                      -- {"12": "B", …}
);

-- Sloupce doplněné později. "add column if not exists" → skript jde spustit
-- znovu i nad tabulkou, která už existuje (a má data).
alter table public.kola add column if not exists
  obtiznost smallint check (obtiznost between 1 and 3);        -- null = všechny obtížnosti
alter table public.kola add column if not exists
  rezim text not null default 'bezne'
  check (rezim in ('bezne', 'chyby', 'denni'));                -- běžné kolo / opakování chyb / denní výzva

alter table public.kola add column if not exists
  den date;                                                    -- jen u denní výzvy: ke kterému dni patří

create index if not exists kola_uzivatel_idx
  on public.kola (uzivatel_id, konec desc) where konec is not null;

-- Denní výzva: přihlášený hráč má na každý den jen jedno kolo
-- (jedinečný index to hlídá i při dvou současných požadavcích).
create unique index if not exists kola_denni_jednou_idx
  on public.kola (uzivatel_id, den)
  where rezim = 'denni' and uzivatel_id is not null;

-- ---------------------------------------------------------------------
-- Denní výzva: sada otázek pro každý den (pro všechny hráče stejná).
-- Vytvoří ji první hráč, který ten den výzvu otevře (zacni_kolo).
-- ---------------------------------------------------------------------
create table if not exists public.denni_vyzvy (
  den        date primary key,
  otazky     integer[] not null,
  vytvoreno  timestamptz not null default now()
);

create index if not exists kola_zebricek_idx
  on public.kola (uzivatel_id, skore desc, (konec - zacatek))
  where konec is not null and uzivatel_id is not null and kategorie is null;

create index if not exists kola_neodevzdana_idx
  on public.kola (zacatek) where konec is null;

-- ---------------------------------------------------------------------
-- RLS (Row Level Security) – zapnuto na všech tabulkách.
-- Bez politiky (policy) nevidí role anon/authenticated žádný řádek.
-- ---------------------------------------------------------------------
alter table public.otazky          enable row level security;
alter table private.otazky_reseni  enable row level security;
alter table public.profily         enable row level security;
alter table public.kola            enable row level security;
alter table public.denni_vyzvy     enable row level security;

-- Práva: nejdřív všechno odebrat, pak povolit jen to nutné.
-- (Supabase nové tabulky automaticky zpřístupňuje – tady to zužujeme.)
revoke all on public.otazky          from anon, authenticated;
revoke all on private.otazky_reseni  from anon, authenticated;
revoke all on public.profily         from anon, authenticated;
revoke all on public.kola            from anon, authenticated;
revoke all on public.denni_vyzvy     from anon, authenticated;   -- jen přes funkce

-- Otázky: žádný přímý přístup. Hráč je dostane jen přes zacni_kolo().

-- Profil: přihlášený hráč čte a mění jen svůj vlastní (a jen přezdívku).
grant select, update (prezdivka) on public.profily to authenticated;

drop policy if exists "profil: cist svuj" on public.profily;
create policy "profil: cist svuj" on public.profily
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profil: menit svuj" on public.profily;
create policy "profil: menit svuj" on public.profily
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Kola: přihlášený hráč čte jen svá kola. Zápis jen přes funkce.
grant select on public.kola to authenticated;

drop policy if exists "kola: cist svoje" on public.kola;
create policy "kola: cist svoje" on public.kola
  for select to authenticated
  using ((select auth.uid()) = uzivatel_id);

-- ---------------------------------------------------------------------
-- Automatické založení profilu při registraci
-- Přezdívka se vezme z registračního formuláře; když chybí (přihlášení
-- přes Google) nebo je obsazená, vygeneruje se "hrac-1234".
-- Skutečné jméno z Google účtu záměrně NEPOUŽÍVÁME (žebříček je veřejný).
-- ---------------------------------------------------------------------
create or replace function private.zalozit_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prezdivka text := trim(new.raw_user_meta_data ->> 'prezdivka');
begin
  if v_prezdivka is null or char_length(v_prezdivka) not between 3 and 20 then
    v_prezdivka := 'hrac-' || floor(random() * 9000 + 1000)::int;
  end if;

  -- obsazená přezdívka → přidat náhodné číslo (max. 20 znaků)
  while exists (select 1 from public.profily where prezdivka = v_prezdivka) loop
    v_prezdivka := left(v_prezdivka, 15) || '-' || floor(random() * 9000 + 1000)::int;
  end loop;

  insert into public.profily (id, prezdivka) values (new.id, v_prezdivka);
  return new;
end;
$$;

revoke all on function private.zalozit_profil() from public, anon, authenticated;
-- Trigger spouští služba Supabase Auth – jen ona smí tuto funkci použít.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.zalozit_profil() to supabase_auth_admin;

-- "or replace" místo drop + create: drop by vyžadoval vlastnictví auth.users
create or replace trigger po_registraci
  after insert on auth.users
  for each row execute function private.zalozit_profil();
