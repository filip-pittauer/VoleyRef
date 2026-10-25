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
-- private.reseni_skryte(rezim, den) → true u kola dnešní denní výzvy.
-- Otázky jsou ten den pro všechny stejné, takže správné odpovědi
-- (ani to, které otázky hráč pokazil) se nesmí ukázat dřív než zítra.
-- ---------------------------------------------------------------------
create or replace function private.reseni_skryte(p_rezim text, p_den date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_rezim = 'denni' and p_den >= private.dnes();
$$;

revoke all on function private.reseni_skryte(text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- private.otazky_kola(otazky) → otázky kola BEZ správných odpovědí
-- (pole JSON ve stejném pořadí jako p_otazky)
-- ---------------------------------------------------------------------
create or replace function private.otazky_kola(p_otazky integer[])
returns jsonb
language sql
stable
set search_path = ''
as $$
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
  from unnest(p_otazky) with ordinality as u (id, poradi)
  join public.otazky o on o.id = u.id;
$$;

-- ---------------------------------------------------------------------
-- private.vysledky_kola(otazky, odpovedi, skryt) → vyhodnocení po otázkách
--   [{ id, odpoved, spravna, je_spravne, vysvetleni }]
-- skryt = true → jen [{ id, odpoved }] (dnešní denní výzva)
-- ---------------------------------------------------------------------
create or replace function private.vysledky_kola(p_otazky integer[], p_odpovedi jsonb, p_skryt boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_agg(
           jsonb_build_object('id', u.id, 'odpoved', p_odpovedi ->> u.id::text)
           -- || spojí dva JSON objekty (jako sloučení slovníků)
           || case when p_skryt then '{}'::jsonb else jsonb_build_object(
                'spravna', r.spravna,
                'je_spravne', coalesce((p_odpovedi ->> u.id::text) = r.spravna, false),
                'vysvetleni', r.vysvetleni) end
           order by u.poradi)
  from unnest(p_otazky) with ordinality as u (id, poradi)
  join private.otazky_reseni r on r.otazka_id = u.id;
$$;

revoke all on function private.otazky_kola(integer[])                   from public, anon, authenticated;
revoke all on function private.vysledky_kola(integer[], jsonb, boolean) from public, anon, authenticated;

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
      and not private.reseni_skryte(k.rezim, k.den)   -- dnešní denní výzva by prozradila chyby
    order by u.id, k.konec desc
  ) as posledni
  join private.otazky_reseni r on r.otazka_id = posledni.id
  join public.otazky o on o.id = posledni.id
  where o.aktivni
    and posledni.odpoved is distinct from r.spravna;
$$;

revoke all on function private.chybne_otazky(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Zkouška: parametry na jednom místě (počet otázek, časový limit,
-- hranice úspěchu). Web je dostane od zacni_kolo, nemá je natvrdo.
-- ---------------------------------------------------------------------
create or replace function private.zkouska_otazek()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;

create or replace function private.zkouska_limit()
returns interval language sql immutable set search_path = '' as $$ select interval '30 minutes' $$;

-- potřebný počet správných odpovědí: 80 % (zaokrouhleno nahoru)
create or replace function private.zkouska_hranice(p_pocet integer)
returns integer language sql immutable set search_path = '' as $$ select ceil(p_pocet * 0.8)::integer $$;

-- Zkouška je splněná, když má dost bodů a byla odevzdaná v limitu.
-- Minuta navíc kryje zpoždění sítě: web odevzdá sám, jakmile čas vyprší.
create or replace function private.zkouska_splnena(p_skore integer, p_pocet integer, p_trvani interval)
returns boolean
language sql immutable set search_path = '' as $$
  select p_skore >= private.zkouska_hranice(p_pocet)
     and p_trvani <= private.zkouska_limit() + interval '1 minute';
$$;

revoke all on function private.zkouska_otazek()                            from public, anon, authenticated;
revoke all on function private.zkouska_limit()                             from public, anon, authenticated;
revoke all on function private.zkouska_hranice(integer)                    from public, anon, authenticated;
revoke all on function private.zkouska_splnena(integer, integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- zacni_kolo(kategorie, obtiznost, rezim) → { kolo_id, otazky: [...] }
-- Založí kolo a uloží čas startu (na serveru, takže ho hráč nemůže
-- podvrhnout). Vrací otázky BEZ správných odpovědí.
--   rezim 'bezne' = až 10 náhodných otázek (lze zúžit kategorií a obtížností)
--   rezim 'chyby' = jen otázky, ve kterých hráč naposledy chyboval
--   rezim 'denni' = denní výzva: 5 otázek, pro všechny hráče ten den stejných.
--                   Jen pro přihlášené (anonym by mohl hrát pořád dokola
--                   a zjistit řešení). Jeden pokus; rozehrané kolo pokračuje
--                   (čas běží dál), dokončené už znovu začít nejde.
--   rezim 'zkouska' = test na čas: 30 otázek, z každé kategorie nejvýš 3,
--                   aby byly zastoupené všechny. Vrací i limit a hranici.
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
  v_zkouska boolean := p_rezim = 'zkouska';
  v_den     date := private.dnes();
  v_hotovo  boolean;
begin
  if p_rezim is null or p_rezim not in ('bezne', 'chyby', 'denni', 'zkouska') then
    raise exception 'Neznámý režim kola.';
  end if;
  if v_chyby and auth.uid() is null then
    raise exception 'Pro opakování chyb se přihlas.';
  end if;
  if v_denni and auth.uid() is null then
    raise exception 'Pro denní výzvu se přihlas.';
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

    -- jeden pokus denně
    select k.id, k.konec is not null
    into v_kolo_id, v_hotovo
    from public.kola k
    where k.uzivatel_id = auth.uid() and k.rezim = 'denni' and k.den = v_den;

    if v_hotovo then
      raise exception 'Dnešní výzvu už máš odehranou.';
    end if;
    -- v_kolo_id není null → rozehrané kolo, pokračuje se v něm
  elsif v_zkouska then
    -- row_number() očísluje otázky v každé kategorii náhodně (partition by
    -- = „pro každou skupinu zvlášť“). Řazení podle tohoto čísla vezme
    -- nejdřív první a druhou otázku z každé kategorie, zbytek do 30 doplní
    -- třetí otázky náhodných kategorií. Každá kategorie má tak 2–3 otázky.
    -- Vnější "order by random()" pak zamíchá pořadí ve zkoušce.
    select coalesce(array_agg(vyber.id order by random()), '{}')
    into v_otazky
    from (
      select k.id
      from (
        select o.id,
               row_number() over (partition by o.kategorie order by random()) as poradi
        from public.otazky o
        where o.aktivni
          and exists (select 1 from private.otazky_reseni r where r.otazka_id = o.id)
      ) as k
      where k.poradi <= 3
      order by k.poradi, random()
      limit private.zkouska_otazek()
    ) as vyber;
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
    -- jen u zkoušky: limit v sekundách a kolik správných odpovědí je potřeba
    'zkouska', case when v_zkouska then jsonb_build_object(
                 'limit_s', extract(epoch from private.zkouska_limit())::integer,
                 'hranice', private.zkouska_hranice(cardinality(v_otazky))) end,
    'otazky', private.otazky_kola(v_otazky)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- odevzdej_kolo(kolo_id, odpovedi) → { skore, pocet, trvani_s, vysledky, reseni_skryte, nove_odznaky, zkouska }
-- odpovedi = {"12": "B", "7": "A", …}
-- Body i čas počítá server. Kolo jde odevzdat jen jednou a jen tím,
-- kdo ho začal. U dnešní denní výzvy jsou ve výsledcích jen odpovědi
-- hráče (reseni_skryte = true); řešení vrátí zítra reseni_denni_vyzvy.
-- ---------------------------------------------------------------------
create or replace function public.odevzdej_kolo(p_kolo_id uuid, p_odpovedi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo      public.kola;
  v_ulozene   jsonb;
  v_skore     integer;
  v_skryt     boolean;
  v_nove      text[] := '{}';
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
    count(*) filter (where (p_odpovedi ->> u.id::text) = r.spravna),
    -- uložíme jen odpovědi na otázky z tohoto kola (nic navíc)
    jsonb_object_agg(u.id::text, p_odpovedi ->> u.id::text)
  into v_skore, v_ulozene
  from unnest(v_kolo.otazky) as u (id)
  join private.otazky_reseni r on r.otazka_id = u.id;

  v_skryt := private.reseni_skryte(v_kolo.rezim, v_kolo.den);

  update public.kola
  set konec = now(), skore = v_skore, odpovedi = v_ulozene
  where id = p_kolo_id;

  -- Odznaky (05_odznaky.sql) – jen přihlášený hráč. Chyba při jejich
  -- výpočtu nesmí zmařit odevzdání kola, proto vlastní blok s ošetřením
  -- výjimky (vrátí se jen zápis odznaků, výsledek kola zůstane).
  if auth.uid() is not null then
    begin
      v_nove := private.udel_odznaky(auth.uid());
    exception when others then
      raise warning 'Odznaky se nepodařilo udělit: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'skore', v_skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from now() - v_kolo.zacatek))::integer,
    'vysledky', private.vysledky_kola(v_kolo.otazky, v_ulozene, v_skryt),
    'reseni_skryte', v_skryt,
    'nove_odznaky', to_jsonb(v_nove),
    -- jen u zkoušky: prošel/neprošel (vcas = odevzdáno v limitu)
    'zkouska', case when v_kolo.rezim = 'zkouska' then jsonb_build_object(
                 'hranice', private.zkouska_hranice(v_kolo.pocet),
                 'vcas', now() - v_kolo.zacatek <= private.zkouska_limit() + interval '1 minute',
                 'splneno', private.zkouska_splnena(v_skore, v_kolo.pocet, now() - v_kolo.zacatek)) end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reseni_denni_vyzvy(den) → { den, skore, pocet, trvani_s, otazky, vysledky }
-- Řešení denní výzvy, kterou hráč odehrál – až když je den uzavřený
-- (nejdřív zítra). otazky jako v zacni_kolo, vysledky jako v odevzdej_kolo.
-- Jen vlastní kolo přihlášeného hráče.
-- ---------------------------------------------------------------------
create or replace function public.reseni_denni_vyzvy(p_den date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kolo public.kola;
begin
  if auth.uid() is null then
    raise exception 'Nejsi přihlášený.';
  end if;
  if p_den is null or p_den >= private.dnes() then
    raise exception 'Řešení denní výzvy bude až zítra.';
  end if;

  select * into v_kolo
  from public.kola k
  where k.uzivatel_id = auth.uid() and k.rezim = 'denni' and k.den = p_den and k.konec is not null;

  if not found then
    raise exception 'Tuto denní výzvu jsi neodehrál.';
  end if;

  return jsonb_build_object(
    'den', v_kolo.den,
    'skore', v_kolo.skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from v_kolo.konec - v_kolo.zacatek))::integer,
    'otazky', private.otazky_kola(v_kolo.otazky),
    'vysledky', private.vysledky_kola(v_kolo.otazky, v_kolo.odpovedi, false)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- zebricek(limit) → nejlepší kolo každého přihlášeného hráče
-- Pořadí: více bodů, při shodě kratší čas.
-- Počítají se jen běžná kola ze všech kategorií a obtížností (ne vybraná
-- kategorie/obtížnost, opakování chyb ani denní výzva) a kola s rozumným
-- časem (aspoň 2 s na otázku – ochrana proti botům).
-- Vrací i odznaky, které si hráč vybral do žebříčku (nejvýše 3).
-- ---------------------------------------------------------------------
-- Změna vracených sloupců nejde přes "create or replace" → nejdřív smazat.
drop function if exists public.zebricek(integer);

create or replace function public.zebricek(p_limit integer default 50)
returns table (
  poradi     bigint,
  prezdivka  text,
  skore      smallint,
  pocet      smallint,
  trvani_s   integer,
  datum      timestamptz,
  je_moje    boolean,
  odznaky    text[]
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
      and k.konec - k.zacatek >= make_interval(secs => k.pocet * 2)
    order by k.uzivatel_id, k.skore desc, k.konec - k.zacatek asc
  )
  select
    rank() over (order by n.skore desc, n.trvani asc),
    p.prezdivka,
    n.skore,
    n.pocet,
    round(extract(epoch from n.trvani))::integer,
    n.konec,
    coalesce(n.uzivatel_id = auth.uid(), false),
    p.vybrane_odznaky
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
revoke all on function public.reseni_denni_vyzvy(date)        from public, anon, authenticated;
revoke all on function public.zebricek(integer)              from public, anon, authenticated;
revoke all on function public.pocet_chyb()                    from public, anon, authenticated;
revoke all on function public.smazat_ucet()                   from public, anon, authenticated;

grant execute on function public.zacni_kolo(text, integer, text) to anon, authenticated;
grant execute on function public.odevzdej_kolo(uuid, jsonb)      to anon, authenticated;
grant execute on function public.reseni_denni_vyzvy(date)        to authenticated;
grant execute on function public.zebricek(integer)               to anon, authenticated;
grant execute on function public.pocet_chyb()                    to authenticated;
grant execute on function public.smazat_ucet()                   to authenticated;
