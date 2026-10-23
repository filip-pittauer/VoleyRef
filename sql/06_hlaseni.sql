-- =====================================================================
-- 06_hlaseni.sql – hlášení chyb v otázkách a gestech od hráčů
-- Spusť po 01–05. Jde spustit i opakovaně.
--
-- Hráč hlásí z výsledku kola (kvíz, zkouška) nebo z kvízu gest.
-- Z webu jde hlášení jen ODESLAT (funkce nahlasit_chybu), číst ho nejde.
-- Hlášení se prohlížejí v dashboardu Supabase:
--   Table Editor → schéma "private" → prehled_hlaseni   (čtení s textem otázky)
--   Table Editor → schéma "public"  → hlaseni           (změna stavu, poznámka)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabulka hlášení. Hlásí se buď otázka (otazka_id), nebo gesto (gesto =
-- id z gesta/gesta.json – gesta nejsou v databázi), vždy právě jedno.
-- uzivatel_id: kdo hlásil (null = nepřihlášený, nebo účet už smazaný –
-- "on delete set null" hlášení ponechá, ale odpojí od osoby).
-- ---------------------------------------------------------------------
create table if not exists public.hlaseni (
  id           bigint generated always as identity primary key,
  otazka_id    integer references public.otazky (id) on delete cascade,
  gesto        text check (gesto ~ '^[a-z0-9-]{1,40}$'),
  typ          text not null check (typ in ('odpoved', 'zadani', 'vysvetleni', 'preklep', 'animace', 'jine')),
  text         text check (char_length(text) <= 1000),
  uzivatel_id  uuid references auth.users (id) on delete set null,
  stav         text not null default 'nove' check (stav in ('nove', 'vyreseno', 'zamitnuto')),
  poznamka     text,                       -- tvoje poznámka k vyřízení
  vytvoreno    timestamptz not null default now(),
  check ((otazka_id is null) <> (gesto is null))   -- právě jedno z nich
);

create index if not exists hlaseni_vytvoreno_idx on public.hlaseni (vytvoreno);

-- Žádný přímý přístup z webu (zápis jen přes funkci níže).
alter table public.hlaseni enable row level security;
revoke all on public.hlaseni from anon, authenticated;

-- ---------------------------------------------------------------------
-- nahlasit_chybu(otazka_id, gesto, typ, text) – uloží hlášení
-- Ochrana proti spamu:
--   přihlášený: stejnou otázku/gesto jen jednou, nejvýš 20 hlášení za hodinu
--   nepřihlášení: dohromady nejvýš 50 hlášení za hodinu (jinak je nerozlišíme)
-- ---------------------------------------------------------------------
create or replace function public.nahlasit_chybu(
  p_otazka_id integer default null,
  p_gesto     text default null,
  p_typ       text default 'jine',
  p_text      text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := nullif(trim(p_text), '');
begin
  if (p_otazka_id is null) = (p_gesto is null) then
    raise exception 'Hlášení musí být k jedné otázce nebo jednomu gestu.';
  end if;
  if p_otazka_id is not null and not exists (select 1 from public.otazky where id = p_otazka_id) then
    raise exception 'Otázka neexistuje.';
  end if;
  if char_length(v_text) > 1000 then
    raise exception 'Text hlášení je moc dlouhý (nejvýš 1000 znaků).';
  end if;

  if auth.uid() is not null then
    if exists (
      select 1 from public.hlaseni h
      where h.uzivatel_id = auth.uid()
        and (h.otazka_id = p_otazka_id or h.gesto = p_gesto)
    ) then
      raise exception 'Tohle už jsi nahlásil, díky.';
    end if;
    if (select count(*) from public.hlaseni h
        where h.uzivatel_id = auth.uid() and h.vytvoreno > now() - interval '1 hour') >= 20 then
      raise exception 'Moc hlášení za krátkou dobu, zkus to později.';
    end if;
  elsif (select count(*) from public.hlaseni h
         where h.uzivatel_id is null and h.vytvoreno > now() - interval '1 hour') >= 50 then
    raise exception 'Moc hlášení za krátkou dobu, zkus to později.';
  end if;

  -- kontroly typu, formátu id gesta a délky hlídá i tabulka (check)
  insert into public.hlaseni (otazka_id, gesto, typ, text, uzivatel_id)
  values (p_otazka_id, p_gesto, p_typ, v_text, auth.uid());
end;
$$;

revoke all on function public.nahlasit_chybu(integer, text, text, text) from public, anon, authenticated;
grant execute on function public.nahlasit_chybu(integer, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- private.prehled_hlaseni – pro tebe v dashboardu: hlášení s textem
-- otázky, správnou odpovědí a počtem hlášení stejné otázky/gesta.
-- Je ve schématu private, takže se k němu web nedostane (obsahuje
-- správné odpovědi). Nejnovější nahoře, nevyřízená napřed.
-- ---------------------------------------------------------------------
create or replace view private.prehled_hlaseni as
select
  h.id,
  h.stav,
  h.vytvoreno,
  coalesce('otázka ' || h.otazka_id, 'gesto ' || h.gesto) as co,
  h.typ,
  h.text,
  count(*) over (partition by h.otazka_id, h.gesto) as hlaseni_celkem,
  o.situace,
  o.odpovedi,
  r.spravna,
  r.vysvetleni,
  o.pravidlo,
  p.prezdivka as nahlasil,
  h.poznamka
from public.hlaseni h
left join public.otazky o on o.id = h.otazka_id
left join private.otazky_reseni r on r.otazka_id = h.otazka_id
left join public.profily p on p.id = h.uzivatel_id
order by h.stav = 'nove' desc, h.vytvoreno desc;

revoke all on private.prehled_hlaseni from public, anon, authenticated;
