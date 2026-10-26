-- =====================================================================
-- 10_duely.sql – asynchronní duely: po kole „Vyzvat kamaráda“ (odkaz s kódem),
-- kamarád hraje stejné otázky / gesta / situace, kdy má čas.
-- Spusť po 01–09. Jde spustit i opakovaně. Tabulka public.duely je v 01.
--
-- Jen přihlášení. Kolo soupeře má režim 'duel' – nedává body za odpovědi
-- (jinak by se duely daly použít k obcházení denního limitu), oba ale
-- dostanou bonus za výsledek: výhra 30, remíza 15 (nejvýš 3 bonusy denně).
-- Vyhodnocení: víc správně; při shodě kratší čas (u Rotačního sprintu remíza).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nastavení duelů – jedno místo pro změnu
-- ---------------------------------------------------------------------
create or replace function private.duel_nastaveni()
returns table (bonus_vyhra integer, bonus_remiza integer, denni_limit_bonusu integer,
               platnost interval, max_otevrenych integer)
language sql
immutable
set search_path = ''
as $$
  select 30, 15, 3, interval '7 days', 20;
$$;

-- hry, ve kterých jde vyzvat (denní výzva a Výuka ne)
create or replace function private.duel_hra_povolena(p_kolo public.kola)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kolo.rezim = 'bezne'
     and p_kolo.hra in ('kviz', 'gesta', 'gesto-naopak', 'odpiskej', 'rotace')
     and (p_kolo.hra <> 'kviz' or (p_kolo.kategorie is null and p_kolo.obtiznost is null));
$$;

-- ---------------------------------------------------------------------
-- vytvor_duel(kolo_id) → { kod }
-- Výzva z vlastního odehraného kola. Kód je náhodný (z gen_random_uuid).
-- ---------------------------------------------------------------------
create or replace function public.vytvor_duel(p_kolo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo public.kola;
  v_kod  text;
  v_nast record;
begin
  select * into v_nast from private.duel_nastaveni();
  if auth.uid() is null then
    raise exception 'Pro duel se přihlas.';
  end if;
  select * into v_kolo from public.kola where id = p_kolo_id;
  if not found or v_kolo.uzivatel_id <> auth.uid() or v_kolo.konec is null
     or not private.duel_hra_povolena(v_kolo) then
    raise exception 'Z tohoto kola duel vytvořit nejde.';
  end if;
  if (select count(*) from public.duely d
      where d.vyzyvatel_id = auth.uid() and d.souper_id is null
        and d.vytvoreno > now() - v_nast.platnost) >= v_nast.max_otevrenych then
    raise exception 'Máš moc nepřijatých výzev. Počkej, až je kamarádi odehrají.';
  end if;

  v_kod := left(replace(gen_random_uuid()::text, '-', ''), 10);
  insert into public.duely (kod, hra, vyzyvatel_id, kolo_vyzyvatele)
  values (v_kod, v_kolo.hra, auth.uid(), v_kolo.id);
  return jsonb_build_object('kod', v_kod);
end;
$$;

-- stav duelu: 'ceka' (nikdo nepřijal), 'hraje', 'hotovo', 'vyprselo'
create or replace function private.duel_stav(p_duel public.duely)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when p_duel.dohrano is not null then 'hotovo'
           when coalesce(p_duel.prijato, p_duel.vytvoreno) < now() - (select platnost from private.duel_nastaveni()) then 'vyprselo'
           when p_duel.souper_id is not null then 'hraje'
           else 'ceka'
         end;
$$;

-- ---------------------------------------------------------------------
-- detail_duelu(kod) → { kod, hra, stav, vyzyvatel, souper, je_vyzyvatel, je_souper,
--   vyzyvatel_vysledek: { skore, pocet, trvani_s }, souper_vysledek (jen hotovo),
--   vysledek, muj_bonus }
-- Výsledek vyzyvatele je vidět hned (motivace), soupeře až po dohrání.
-- ---------------------------------------------------------------------
create or replace function public.detail_duelu(p_kod text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_duel public.duely;
  v_kv   public.kola;
  v_ks   public.kola;
  v_stav text;
begin
  select * into v_duel from public.duely where kod = p_kod;
  if not found then
    raise exception 'Duel neexistuje.';
  end if;
  select * into v_kv from public.kola where id = v_duel.kolo_vyzyvatele;
  select * into v_ks from public.kola where id = v_duel.kolo_soupere;
  v_stav := private.duel_stav(v_duel);

  return jsonb_build_object(
    'kod', v_duel.kod,
    'hra', v_duel.hra,
    'stav', v_stav,
    'vyzyvatel', (select p.prezdivka from public.profily p where p.id = v_duel.vyzyvatel_id),
    'souper', (select p.prezdivka from public.profily p where p.id = v_duel.souper_id),
    'je_vyzyvatel', v_duel.vyzyvatel_id = auth.uid(),
    'je_souper', coalesce(v_duel.souper_id = auth.uid(), false),
    'vyzyvatel_vysledek', jsonb_build_object('skore', v_kv.skore, 'pocet', v_kv.pocet,
                            'trvani_s', round(extract(epoch from v_kv.konec - v_kv.zacatek))::integer),
    'souper_vysledek', case when v_stav = 'hotovo' then jsonb_build_object('skore', v_ks.skore, 'pocet', v_ks.pocet,
                            'trvani_s', round(extract(epoch from v_ks.konec - v_ks.zacatek))::integer) end,
    'vysledek', v_duel.vysledek,
    'muj_bonus', case when v_duel.vyzyvatel_id = auth.uid() then v_duel.bonus_vyzyvatel
                      when v_duel.souper_id = auth.uid() then v_duel.bonus_souper end);
end;
$$;

-- zadání kola pro hru (stejný tvar jako zacni_* dané hry)
create or replace function private.duel_zadani(p_kolo public.kola)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_kolo.hra
    when 'kviz' then jsonb_build_object('otazky', private.otazky_kola(p_kolo.otazky))
    when 'odpiskej' then jsonb_build_object('situace', (
      select jsonb_agg(jsonb_build_object('id', s.id, 'kdo', s.kdo, 'text', s.text) order by p.poradi)
      from unnest(p_kolo.polozky) with ordinality as p (id, poradi)
      join public.odpiskej_situace s on s.id = p.id::integer))
    when 'rotace' then jsonb_build_object('situace', p_kolo.data,
      'limit_s', (select h.casovy_limit_s from private.hodnoty_her h where h.hra = 'rotace' and h.rezim = 'bezne'))
    else jsonb_build_object('polozky', to_jsonb(p_kolo.polozky))
  end;
$$;

-- ---------------------------------------------------------------------
-- prijmi_duel(kod) → { hra, kolo_id, …zadání jako u zacni_* té hry }
-- Soupeř dostane kopii kola vyzyvatele (stejné otázky / situace, nový čas).
-- Rozehraný duel pokračuje (čas běží od prvního přijetí).
-- ---------------------------------------------------------------------
create or replace function public.prijmi_duel(p_kod text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duel public.duely;
  v_kv   public.kola;
  v_ks   public.kola;
begin
  if auth.uid() is null then
    raise exception 'Pro duel se přihlas.';
  end if;
  select * into v_duel from public.duely where kod = p_kod for update;
  if not found then
    raise exception 'Duel neexistuje.';
  end if;
  if v_duel.vyzyvatel_id = auth.uid() then
    raise exception 'Vlastní výzvu hrát nemůžeš – pošli odkaz kamarádovi.';
  end if;
  if v_duel.souper_id is not null and v_duel.souper_id <> auth.uid() then
    raise exception 'Tuhle výzvu už přijal někdo jiný.';
  end if;
  if private.duel_stav(v_duel) = 'vyprselo' then
    raise exception 'Výzva vypršela.';
  end if;

  -- rozehraný duel pokračuje; kolo smazané úklidem nedohraných kol (po 1 dni) se založí znovu
  if v_duel.souper_id = auth.uid() and v_duel.kolo_soupere is not null then
    select * into v_ks from public.kola where id = v_duel.kolo_soupere;
    if v_ks.konec is not null then
      raise exception 'Tenhle duel už máš odehraný.';
    end if;
  else
    select * into v_kv from public.kola where id = v_duel.kolo_vyzyvatele;
    insert into public.kola (uzivatel_id, hra, rezim, otazky, polozky, data, pocet)
    values (auth.uid(), v_kv.hra, 'duel', v_kv.otazky, v_kv.polozky, v_kv.data,
            case when v_kv.hra = 'rotace' then jsonb_array_length(v_kv.data) else v_kv.pocet end)
    returning * into v_ks;
    update public.duely set souper_id = auth.uid(), kolo_soupere = v_ks.id, prijato = now()
    where id = v_duel.id;
  end if;

  return jsonb_build_object('hra', v_ks.hra, 'kolo_id', v_ks.id) || private.duel_zadani(v_ks);
end;
$$;

-- ---------------------------------------------------------------------
-- dokonci_duel – trigger: když soupeř odevzdá kolo duelu, spočítá výsledek
-- a bonusy (stejně pro všechny hry, nezávisle na funkcích odevzdej_*).
-- ---------------------------------------------------------------------
create or replace function private.bonus_duelu(p_uzivatel uuid, p_bonus integer)
returns integer
language sql
stable
set search_path = ''
as $$
  -- denní limit bonusů: kolik jich hráč dnes už dostal
  select case
           when p_bonus = 0 then 0
           when (select count(*) from public.duely d
                 where (d.vyzyvatel_id = p_uzivatel and d.bonus_vyzyvatel > 0
                        or d.souper_id = p_uzivatel and d.bonus_souper > 0)
                   and (d.dohrano at time zone 'Europe/Prague')::date = private.dnes())
                >= (select denni_limit_bonusu from private.duel_nastaveni()) then 0
           else p_bonus
         end;
$$;

create or replace function private.dokonci_duel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duel     public.duely;
  v_kv       public.kola;
  v_nast     record;
  v_vysledek text;
  v_cas_v    interval;
  v_cas_s    interval;
begin
  select * into v_duel from public.duely where kolo_soupere = new.id for update;
  if not found or v_duel.dohrano is not null then
    return new;
  end if;
  select * into v_kv from public.kola where id = v_duel.kolo_vyzyvatele;
  select * into v_nast from private.duel_nastaveni();
  v_cas_v := v_kv.konec - v_kv.zacatek;
  v_cas_s := new.konec - new.zacatek;

  v_vysledek := case
    -- příliš rychlé kolo soupeře (méně než 2 s na položku) = prohra (ochrana proti botům)
    when v_cas_s < make_interval(secs => new.pocet * 2) then 'vyzyvatel'
    when new.skore > v_kv.skore then 'souper'
    when new.skore < v_kv.skore then 'vyzyvatel'
    -- sprint má pevný čas → při shodě remíza
    when new.hra = 'rotace' or abs(extract(epoch from v_cas_s - v_cas_v)) < 1 then 'remiza'
    when v_cas_s < v_cas_v then 'souper'
    else 'vyzyvatel'
  end;

  update public.duely
  set dohrano = now(),
      vysledek = v_vysledek,
      bonus_vyzyvatel = private.bonus_duelu(v_duel.vyzyvatel_id, case v_vysledek
                          when 'vyzyvatel' then v_nast.bonus_vyhra when 'remiza' then v_nast.bonus_remiza else 0 end),
      bonus_souper = private.bonus_duelu(v_duel.souper_id, case v_vysledek
                          when 'souper' then v_nast.bonus_vyhra when 'remiza' then v_nast.bonus_remiza else 0 end)
  where id = v_duel.id;
  return new;
end;
$$;

drop trigger if exists kola_duel_dohrano on public.kola;
create trigger kola_duel_dohrano
  after update of konec on public.kola
  for each row
  when (new.rezim = 'duel' and old.konec is null and new.konec is not null)
  execute function private.dokonci_duel();

-- ---------------------------------------------------------------------
-- moje_duely() → { aktivni: [...], hotove: [...] }
-- aktivni = čeká na soupeře nebo se hraje; hotove = dohrané a vypršelé (50 posledních).
-- Položka: { kod, hra, stav, ja_vyzyvatel, protihrac, moje: {skore, pocet},
--            jeho: {skore, pocet} | null, vysledek: 'vyhra'|'prohra'|'remiza'|null,
--            muj_bonus, vytvoreno, dohrano }
-- ---------------------------------------------------------------------
create or replace function public.moje_duely()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with moje as (
    select d.*, private.duel_stav(d) as stav,
           d.vyzyvatel_id = auth.uid() as ja_vyzyvatel,
           case when d.vyzyvatel_id = auth.uid() then d.kolo_vyzyvatele else d.kolo_soupere end as moje_kolo,
           case when d.vyzyvatel_id = auth.uid() then d.kolo_soupere else d.kolo_vyzyvatele end as jeho_kolo,
           case when d.vyzyvatel_id = auth.uid() then d.souper_id else d.vyzyvatel_id end as protihrac_id
    from public.duely d
    where d.vyzyvatel_id = auth.uid() or d.souper_id = auth.uid()
  ),
  polozky as (
    select m.stav, m.vytvoreno, jsonb_build_object(
      'kod', m.kod, 'hra', m.hra, 'stav', m.stav, 'ja_vyzyvatel', m.ja_vyzyvatel,
      'protihrac', (select p.prezdivka from public.profily p where p.id = m.protihrac_id),
      'moje', (select jsonb_build_object('skore', k.skore, 'pocet', k.pocet) from public.kola k
               where k.id = m.moje_kolo and k.konec is not null),
      'jeho', case when m.stav = 'hotovo' then (select jsonb_build_object('skore', k.skore, 'pocet', k.pocet)
               from public.kola k where k.id = m.jeho_kolo) end,
      'vysledek', case
                    when m.vysledek is null then null
                    when m.vysledek = 'remiza' then 'remiza'
                    when (m.vysledek = 'vyzyvatel') = m.ja_vyzyvatel then 'vyhra'
                    else 'prohra'
                  end,
      'muj_bonus', case when m.ja_vyzyvatel then m.bonus_vyzyvatel else m.bonus_souper end,
      'vytvoreno', m.vytvoreno, 'dohrano', m.dohrano) as polozka
    from moje m
  )
  select jsonb_build_object(
    'aktivni', coalesce((select jsonb_agg(p.polozka order by p.vytvoreno desc) from polozky p
                         where p.stav in ('ceka', 'hraje')), '[]'::jsonb),
    'hotove', coalesce((select jsonb_agg(x.polozka order by x.vytvoreno desc) from (
                          select p.polozka, p.vytvoreno from polozky p where p.stav in ('hotovo', 'vyprselo')
                          order by p.vytvoreno desc limit 50) as x), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Kdo smí funkce volat (deny by default, viz konec 01_schema.sql)
-- ---------------------------------------------------------------------
revoke all on function private.duel_nastaveni()                  from public, anon, authenticated;
revoke all on function private.duel_hra_povolena(public.kola)    from public, anon, authenticated;
revoke all on function private.duel_stav(public.duely)           from public, anon, authenticated;
revoke all on function private.duel_zadani(public.kola)          from public, anon, authenticated;
revoke all on function private.bonus_duelu(uuid, integer)        from public, anon, authenticated;
revoke all on function private.dokonci_duel()                    from public, anon, authenticated;
revoke all on function public.vytvor_duel(uuid)                  from public, anon, authenticated;
revoke all on function public.detail_duelu(text)                 from public, anon, authenticated;
revoke all on function public.prijmi_duel(text)                  from public, anon, authenticated;
revoke all on function public.moje_duely()                       from public, anon, authenticated;

grant execute on function public.vytvor_duel(uuid)   to authenticated;
grant execute on function public.detail_duelu(text)  to authenticated;
grant execute on function public.prijmi_duel(text)   to authenticated;
grant execute on function public.moje_duely()        to authenticated;
