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
                    'rotace-postaveni', 'stridani', 'preruseni-hry', 'chovani', 'signalizace', 'hriste')),
  obtiznost       smallint not null default 1 check (obtiznost between 1 and 3),
  situace         text     not null,
  media           jsonb,
  odpovedi        jsonb    not null,   -- {"A": "…", "B": "…", …}
  pravidlo        text,
  verze_pravidel  text,
  upraveno        timestamptz not null default now()
);

-- Seznam kategorií v už existující tabulce ("create table if not exists"
-- ji nezmění): starou kontrolu smazat a vytvořit znovu s aktuálním seznamem.
alter table public.otazky drop constraint if exists otazky_kategorie_check;
alter table public.otazky add constraint otazky_kategorie_check check (kategorie in (
  'podani', 'prijem-nahravka', 'utok', 'blok', 'dotyky-chyby',
  'rotace-postaveni', 'stridani', 'preruseni-hry', 'chovani', 'signalizace', 'hriste'));

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

-- Odznaky, které si hráč vybral do žebříčku (nejvýše 3, jen získané –
-- hlídá funkce nastav_odznaky v 05_odznaky.sql).
alter table public.profily add column if not exists
  vybrane_odznaky text[] not null default '{}'
  check (cardinality(vybrane_odznaky) <= 3);

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

-- Režimy 'zkouska' a 'procvicovani' přibyly později. Kontrolu u existující
-- tabulky "add column if not exists" nezmění → smazat a vytvořit znovu
-- s aktuálním seznamem.
alter table public.kola drop constraint if exists kola_rezim_check;
alter table public.kola add constraint kola_rezim_check
  check (rezim in ('bezne', 'chyby', 'denni', 'zkouska',      -- + zkouška (test na čas, 02_funkce.sql)
                   'procvicovani'));                          -- + procvičování ve Výuce (kategorie/obtížnost, bez žebříčku)

-- Dřívější „běžná“ kola s vybranou kategorií nebo obtížností jsou podle
-- dnešního rozdělení procvičování (do žebříčku se nepočítala ani dřív).
update public.kola set rezim = 'procvicovani'
where rezim = 'bezne' and (kategorie is not null or obtiznost is not null);

alter table public.kola add column if not exists
  den date;                                                    -- jen u denní výzvy: ke kterému dni patří

create index if not exists kola_uzivatel_idx
  on public.kola (uzivatel_id, konec desc) where konec is not null;

-- ---------------------------------------------------------------------
-- Hry a body do žebříčku (docs/bodovy-system.md)
--   hra        = která hra kolo je (kvíz, kvíz gest…)
--   polozky    = položky kola, které nejsou otázky z tabulky otazky (id gest)
--   body       = body do žebříčku; null = nebodované kolo (procvičování,
--                chyby, zkouška, nepřihlášený hráč)
--   body_duvod = proč 0 bodů: 'limit' = dnešní bodované kolo této hry už
--                bylo, 'rychle' = méně než 2 s na otázku (ochrana proti botům)
-- Body počítá server (private.prirad_body v 02_funkce.sql).
-- ---------------------------------------------------------------------
alter table public.kola add column if not exists hra text not null default 'kviz';
alter table public.kola drop constraint if exists kola_hra_check;
alter table public.kola add constraint kola_hra_check
  check (hra in ('kviz', 'gesta', 'gesto-naopak'));
alter table public.kola add column if not exists polozky text[];
alter table public.kola add column if not exists body integer;
alter table public.kola add column if not exists body_duvod text;
alter table public.kola drop constraint if exists kola_body_duvod_check;
alter table public.kola add constraint kola_body_duvod_check
  check (body_duvod in ('limit', 'rychle'));

-- žebříčky sčítají jen kola s body
create index if not exists kola_body_idx
  on public.kola (konec) where body > 0;

-- Kolik bodů dává která hra a režim. Řádek chybí = režim je nebodovaný.
-- Hodnoty se ladí tady (jedno místo); cíl je zhruba stejně bodů za minutu
-- hraní u každé hry. bonus_rychlost = až tolik bodů navíc za rychlé kolo
-- (denní výzva, viz private.body_za).
create table if not exists private.hodnoty_her (
  hra              text not null,
  rezim            text not null,
  body_za_spravnou integer not null check (body_za_spravnou >= 0),
  bonus_rychlost   integer not null default 0 check (bonus_rychlost >= 0),
  primary key (hra, rezim)
);
alter table private.hodnoty_her enable row level security;   -- web k ní nemá přístup vůbec

insert into private.hodnoty_her (hra, rezim, body_za_spravnou, bonus_rychlost) values
  ('kviz',         'bezne', 10,  0),   -- 10 otázek ~ 3 min
  ('kviz',         'denni', 20, 50),   -- 2× víc + bonus za rychlost, jen 1× denně
  ('gesta',        'bezne',  5,  0),   -- 10 gest ~ 1,5 min
  ('gesto-naopak', 'bezne',  5,  0)
on conflict (hra, rezim) do update
  set body_za_spravnou = excluded.body_za_spravnou, bonus_rychlost = excluded.bonus_rychlost;

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

-- ---------------------------------------------------------------------
-- Získané odznaky. Zapisuje je jen server (05_odznaky.sql), jednou
-- získaný odznak zůstává. Podmínky odznaků jsou v private.metriky_odznaku.
-- ---------------------------------------------------------------------
create table if not exists public.odznaky_hracu (
  uzivatel_id  uuid not null references auth.users (id) on delete cascade,
  odznak       text not null,
  ziskano      timestamptz not null default now(),
  primary key (uzivatel_id, odznak)
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
alter table public.odznaky_hracu   enable row level security;

-- Práva: nejdřív všechno odebrat, pak povolit jen to nutné.
-- (Supabase nové tabulky automaticky zpřístupňuje – tady to zužujeme.)
revoke all on public.otazky          from anon, authenticated;
revoke all on private.otazky_reseni  from anon, authenticated;
revoke all on public.profily         from anon, authenticated;
revoke all on public.kola            from anon, authenticated;
revoke all on public.denni_vyzvy     from anon, authenticated;   -- jen přes funkce
revoke all on public.odznaky_hracu   from anon, authenticated;   -- jen přes funkce

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

-- ---------------------------------------------------------------------
-- Výchozí práva: "deny by default"
-- Supabase nové tabulky, sekvence a funkce ve schématu public automaticky
-- zpřístupní webu (anon, authenticated) a Postgres dává každé nové funkci
-- EXECUTE pro PUBLIC (= všem rolím). Od teď nová tabulka/funkce/sekvence
-- NEMÁ pro web žádná práva – každé právo se musí přidat výslovně (grant)
-- ve skriptu, který objekt vytváří. Na už existující objekty to nemá vliv.
-- "for role postgres" = pro objekty, které vytvoří role postgres (SQL editor).
-- Skript jde spustit opakovaně (odebrané výchozí právo se odebere znovu).
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
-- BEZ "in schema": výchozí EXECUTE pro PUBLIC je globální (platí ve všech
-- schématech), ve schématu by se odebrat nedal.
alter default privileges for role postgres
  revoke execute on functions from public;
