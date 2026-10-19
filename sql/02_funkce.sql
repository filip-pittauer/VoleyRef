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
-- private.chybne_otazky(uzivatel) → id otázek, na které hráč NAPOSLEDY
-- odpověděl špatně. Jakmile otázku v dalším kole zodpoví správně,
-- ze seznamu zmizí. Pomocná funkce – z webu ji volat nejde.
-- ---------------------------------------------------------------------
create or replace function private.chybne_otazky(p_uzivatel uuid)
returns setof integer
language sql
stable
set search_path = ''
as $$
  select posledni.id
  from (
    -- distinct on: pro každou otázku jen nejnovější odpověď
    select distinct on (u.id) u.id, k.odpovedi ->> u.id::text as odpoved
    from public.kola k
    cross join lateral unnest(k.otazky) as u (id)
    where k.uzivatel_id = p_uzivatel and k.konec is not null
    order by u.id, k.konec desc
  ) as posledni
  join private.otazky_reseni r on r.otazka_id = posledni.id
  join public.otazky o on o.id = posledni.id
  where o.aktivni
    and posledni.odpoved is distinct from r.spravna;
$$;

revoke all on function private.chybne_otazky(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- dnes() → dnešní datum v českém čase (nový den začíná o půlnoci v ČR,
-- ne v UTC, ve kterém běží server)
-- ---------------------------------------------------------------------
create or replace function private.dnes()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Prague')::date;
$$;

revoke all on function private.dnes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- zacni_kolo(kategorie, obtiznost, rezim) → { kolo_id, otazky: [...] }
-- Založí kolo a uloží čas startu (na serveru, takže ho hráč nemůže
-- podvrhnout). Vrací otázky BEZ správných odpovědí.
--   rezim 'bezne' = až 10 náhodných otázek (lze zúžit kategorií a obtížností)
--   rezim 'chyby' = jen otázky, ve kterých hráč naposledy chyboval
--   rezim 'denni' = denní výzva: 5 otázek, pro všechny hráče ten den stejných.
--                   Přihlášený hráč má jeden pokus; rozehrané kolo pokračuje
--                   (čas běží dál), dokončené už znovu začít nejde.
-- ---------------------------------------------------------------------
-- Starší verze měla jen jeden parametr. Bez smazání by vedle sebe
-- existovaly dvě funkce stejného jména a API by nevědělo, kterou volat.
drop function if exists public.zacni_kolo(text);

create or replace function public.zacni_kolo(
  p_kategorie text default null,
  p_obtiznost integer default null,
  p_rezim text default 'bezne'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_otazky  integer[];
  v_kolo_id uuid;
  v_chyby   boolean := p_rezim = 'chyby';
  v_denni   boolean := p_rezim = 'denni';
  v_den     date := private.dnes();
  v_hotovo  boolean;
begin
  if p_rezim is null or p_rezim not in ('bezne', 'chyby', 'denni') then
    raise exception 'Neznámý režim kola.';
  end if;
  if v_chyby and auth.uid() is null then
    raise exception 'Pro opakování chyb se přihlas.';
  end if;

  -- úklid: kola, která nikdo neodevzdal do 1 dne
  delete from public.kola
  where konec is null and zacatek < now() - interval '1 day';

  if v_denni then
    -- Dnešní sadu otázek vytvoří první hráč dne, ostatní dostanou stejnou.
    -- "on conflict do nothing": když ji mezitím vytvořil někdo jiný, nic se nestane.
    insert into public.denni_vyzvy (den, otazky)
    select v_den, coalesce(array_agg(vyber.id), '{}')
    from (
      select o.id
      from public.otazky o
      where o.aktivni
        and exists (select 1 from private.otazky_reseni r where r.otazka_id = o.id)
      order by random()
      limit 5
    ) as vyber
    on conflict (den) do nothing;

    select d.otazky into v_otazky from public.denni_vyzvy d where d.den = v_den;

    -- přihlášený hráč: jeden pokus denně
    if auth.uid() is not null then
      select k.id, k.konec is not null
      into v_kolo_id, v_hotovo
      from public.kola k
      where k.uzivatel_id = auth.uid() and k.rezim = 'denni' and k.den = v_den;

      if v_hotovo then
        raise exception 'Dnešní výzvu už máš odehranou.';
      end if;
      -- v_kolo_id není null → rozehrané kolo, pokračuje se v něm
    end if;
  else
    select coalesce(array_agg(vyber.id), '{}')
    into v_otazky
    from (
      select o.id
      from public.otazky o
      where o.aktivni
        and exists (select 1 from private.otazky_reseni r where r.otazka_id = o.id)
        -- opakování chyb: jen chybné otázky, filtry kategorie a obtížnosti se ignorují
        and (not v_chyby or o.id in (select private.chybne_otazky(auth.uid())))
        and (v_chyby or p_kategorie is null or o.kategorie = p_kategorie)
        and (v_chyby or p_obtiznost is null or o.obtiznost = p_obtiznost)
      order by random()
      limit 10
    ) as vyber;
  end if;

  if cardinality(v_otazky) = 0 then
    return jsonb_build_object('kolo_id', null, 'otazky', '[]'::jsonb);
  end if;

  if v_kolo_id is null then
    insert into public.kola (uzivatel_id, kategorie, obtiznost, rezim, den, otazky, pocet)
    values (
      auth.uid(),
      case when p_rezim = 'bezne' then p_kategorie end,
      case when p_rezim = 'bezne' then p_obtiznost end,
      p_rezim,
      case when v_denni then v_den end,
      v_otazky,
      cardinality(v_otazky))
    returning id into v_kolo_id;
  end if;

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
-- Počítají se jen běžná kola ze všech kategorií a obtížností (ne vybraná
-- kategorie/obtížnost, opakování chyb ani denní výzva) a kola s rozumným
-- časem (aspoň 3 s na otázku – ochrana proti botům).
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
      and k.rezim = 'bezne'
      and k.kategorie is null
      and k.obtiznost is null
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
-- pocet_chyb() → kolik otázek má přihlášený hráč k opakování
-- ---------------------------------------------------------------------
create or replace function public.pocet_chyb()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.chybne_otazky(auth.uid());
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
revoke all on function public.zacni_kolo(text, integer, text) from public, anon, authenticated;
revoke all on function public.odevzdej_kolo(uuid, jsonb)      from public, anon, authenticated;
revoke all on function public.zebricek(integer)               from public, anon, authenticated;
revoke all on function public.pocet_chyb()                    from public, anon, authenticated;
revoke all on function public.smazat_ucet()                   from public, anon, authenticated;

grant execute on function public.zacni_kolo(text, integer, text) to anon, authenticated;
grant execute on function public.odevzdej_kolo(uuid, jsonb)      to anon, authenticated;
grant execute on function public.zebricek(integer)               to anon, authenticated;
grant execute on function public.pocet_chyb()                    to authenticated;
grant execute on function public.smazat_ucet()                   to authenticated;
