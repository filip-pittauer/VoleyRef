-- =====================================================================
-- 02_funkce.sql – serverové funkce (RPC), které volá web
-- Spusť až po 01_schema.sql. Jde spustit i opakovaně (create or replace).
--
-- Všechny funkce jsou "security definer": běží s právy vlastníka, takže
-- smějí do tabulek, kam hráč přímo nesmí. Proto si samy hlídají, kdo
-- volá (auth.uid()) a co smí. "set search_path = ''" je ochrana proti
-- podvržení tabulek/funkcí – všechno se proto píše s názvem schématu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- zacni_kolo(kategorie) → { kolo_id, otazky: [...] }
-- Vybere až 10 náhodných aktivních otázek, založí kolo a uloží čas
-- startu (na serveru, takže ho hráč nemůže podvrhnout).
-- Vrací otázky BEZ správných odpovědí.
-- ---------------------------------------------------------------------
create or replace function public.zacni_kolo(p_kategorie text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otazky  integer[];
  v_kolo_id uuid;
begin
  -- úklid: kola, která nikdo neodevzdal do 1 dne
  delete from public.kola
  where konec is null and zacatek < now() - interval '1 day';

  select coalesce(array_agg(vyber.id), '{}')
  into v_otazky
  from (
    select o.id
    from public.otazky o
    where o.aktivni
      and (p_kategorie is null or o.kategorie = p_kategorie)
      and exists (select 1 from private.otazky_reseni r where r.otazka_id = o.id)
    order by random()
    limit 10
  ) as vyber;

  if cardinality(v_otazky) = 0 then
    return jsonb_build_object('kolo_id', null, 'otazky', '[]'::jsonb);
  end if;

  insert into public.kola (uzivatel_id, kategorie, otazky, pocet)
  values (auth.uid(), p_kategorie, v_otazky, cardinality(v_otazky))
  returning id into v_kolo_id;

  return jsonb_build_object(
    'kolo_id', v_kolo_id,
    'otazky', (
      select jsonb_agg(
               jsonb_build_object(
                 'id', o.id,
                 'kategorie', o.kategorie,
                 'obtiznost', o.obtiznost,
                 'situace', o.situace,
                 'media', o.media,
                 'odpovedi', o.odpovedi,
                 'pravidlo', o.pravidlo)
               order by u.poradi)
      from unnest(v_otazky) with ordinality as u (id, poradi)
      join public.otazky o on o.id = u.id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- odevzdej_kolo(kolo_id, odpovedi) → { skore, pocet, trvani_s, vysledky }
-- odpovedi = {"12": "B", "7": "A", …}
-- Body i čas počítá server. Kolo jde odevzdat jen jednou a jen tím,
-- kdo ho začal.
-- ---------------------------------------------------------------------
create or replace function public.odevzdej_kolo(p_kolo_id uuid, p_odpovedi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo      public.kola;
  v_vysledky  jsonb;
  v_ulozene   jsonb;
  v_skore     integer;
begin
  select * into v_kolo
  from public.kola
  where id = p_kolo_id
  for update;   -- zamkne řádek – dvě současná odevzdání se nepotkají

  if not found
     or v_kolo.konec is not null
     or v_kolo.uzivatel_id is distinct from auth.uid() then
    raise exception 'Kolo neexistuje nebo už bylo odevzdané.';
  end if;

  if jsonb_typeof(p_odpovedi) is distinct from 'object' then
    raise exception 'Neplatný formát odpovědí.';
  end if;

  select
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'odpoved', p_odpovedi ->> u.id::text,
        'spravna', r.spravna,
        'je_spravne', coalesce((p_odpovedi ->> u.id::text) = r.spravna, false),
        'vysvetleni', r.vysvetleni)
      order by u.poradi),
    count(*) filter (where (p_odpovedi ->> u.id::text) = r.spravna),
    -- uložíme jen odpovědi na otázky z tohoto kola (nic navíc)
    jsonb_object_agg(u.id::text, p_odpovedi ->> u.id::text)
  into v_vysledky, v_skore, v_ulozene
  from unnest(v_kolo.otazky) with ordinality as u (id, poradi)
  join private.otazky_reseni r on r.otazka_id = u.id;

  update public.kola
  set konec = now(), skore = v_skore, odpovedi = v_ulozene
  where id = p_kolo_id;

  return jsonb_build_object(
    'skore', v_skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from now() - v_kolo.zacatek))::integer,
    'vysledky', v_vysledky
  );
end;
$$;

-- ---------------------------------------------------------------------
-- zebricek(limit) → nejlepší kolo každého přihlášeného hráče
-- Pořadí: více bodů, při shodě kratší čas.
-- Počítají se jen kola ze všech kategorií (ne vybraná kategorie)
-- a kola s rozumným časem (aspoň 3 s na otázku – ochrana proti botům).
-- ---------------------------------------------------------------------
create or replace function public.zebricek(p_limit integer default 50)
returns table (
  poradi     bigint,
  prezdivka  text,
  skore      smallint,
  pocet      smallint,
  trvani_s   integer,
  datum      timestamptz,
  je_moje    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with nejlepsi as (
    select distinct on (k.uzivatel_id)
      k.uzivatel_id,
      k.skore,
      k.pocet,
      k.konec - k.zacatek as trvani,
      k.konec
    from public.kola k
    where k.konec is not null
      and k.uzivatel_id is not null
      and k.kategorie is null
      and k.konec - k.zacatek >= make_interval(secs => k.pocet * 3)
    order by k.uzivatel_id, k.skore desc, k.konec - k.zacatek asc
  )
  select
    rank() over (order by n.skore desc, n.trvani asc),
    p.prezdivka,
    n.skore,
    n.pocet,
    round(extract(epoch from n.trvani))::integer,
    n.konec,
    coalesce(n.uzivatel_id = auth.uid(), false)
  from nejlepsi n
  join public.profily p on p.id = n.uzivatel_id
  order by n.skore desc, n.trvani asc, n.konec asc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- smazat_ucet() – hráč smaže svůj účet. Díky "on delete cascade"
-- zmizí i jeho profil a všechna kola (GDPR: právo na výmaz).
-- ---------------------------------------------------------------------
create or replace function public.smazat_ucet()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nejsi přihlášený.';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Kdo smí funkce volat. Postgres ve výchozím stavu povoluje všem,
-- proto nejdřív odebrat a pak povolit jen potřebným rolím.
--   anon          = nepřihlášený návštěvník
--   authenticated = přihlášený hráč
-- ---------------------------------------------------------------------
revoke all on function public.zacni_kolo(text)           from public, anon, authenticated;
revoke all on function public.odevzdej_kolo(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.zebricek(integer)          from public, anon, authenticated;
revoke all on function public.smazat_ucet()              from public, anon, authenticated;

grant execute on function public.zacni_kolo(text)           to anon, authenticated;
grant execute on function public.odevzdej_kolo(uuid, jsonb) to anon, authenticated;
grant execute on function public.zebricek(integer)          to anon, authenticated;
grant execute on function public.smazat_ucet()              to authenticated;
