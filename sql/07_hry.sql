-- =====================================================================
-- 07_hry.sql – hry mimo kvíz (kvíz gest, Gesto naopak), body a žebříčky
-- Spusť po 01–06. Jde spustit i opakovaně.
-- Pravidla bodů: docs/bodovy-system.md, hodnoty v private.hodnoty_her
-- (01_schema.sql), výpočet v private.prirad_body (02_funkce.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Katalog gest: id a skupina z gesta/gesta.json (animace a názvy zůstávají
-- v JSON pro prohlížeč). Server z něj vybírá gesta do kola. Při změně
-- gesta.json upravit i tento seznam – hlídá test gesta-katalog.
-- ---------------------------------------------------------------------
create table if not exists private.gesta (
  id       text primary key,
  skupina  text not null check (skupina in ('rozhodci', 'carovi'))
);
alter table private.gesta enable row level security;   -- web k ní nemá přístup vůbec

insert into private.gesta (id, skupina) values
  ('povoleni-podani', 'rozhodci'),
  ('tym-podava', 'rozhodci'),
  ('vymena-stran', 'rozhodci'),
  ('oddech', 'rozhodci'),
  ('stridani', 'rozhodci'),
  ('napomenuti', 'rozhodci'),
  ('trest', 'rozhodci'),
  ('vylouceni', 'rozhodci'),
  ('diskvalifikace', 'rozhodci'),
  ('konec-setu', 'rozhodci'),
  ('nadhoz', 'rozhodci'),
  ('zdrzeni-podani', 'rozhodci'),
  ('blok-cloneni', 'rozhodci'),
  ('postaveni-rotace', 'rozhodci'),
  ('mic-v-poli', 'rozhodci'),
  ('mic-v-autu', 'rozhodci'),
  ('zadrzeny-mic', 'rozhodci'),
  ('dvoji-dotek', 'rozhodci'),
  ('ctyri-odbiti', 'rozhodci'),
  ('dotek-site', 'rozhodci'),
  ('presah', 'rozhodci'),
  ('chyba-utoku', 'rozhodci'),
  ('prusnik-cara', 'rozhodci'),
  ('dvojita-chyba', 'rozhodci'),
  ('dotek-mice', 'rozhodci'),
  ('zdrzovani-napomenuti', 'rozhodci'),
  ('zdrzovani-trest', 'rozhodci'),
  ('carovy-v-poli', 'carovi'),
  ('carovy-v-autu', 'carovi'),
  ('carovy-dotek', 'carovi'),
  ('carovy-prostor', 'carovi'),
  ('carovy-nelze', 'carovi')
on conflict (id) do update set skupina = excluded.skupina;

delete from private.gesta where id not in ('povoleni-podani', 'tym-podava', 'vymena-stran', 'oddech', 'stridani', 'napomenuti', 'trest', 'vylouceni', 'diskvalifikace', 'konec-setu', 'nadhoz', 'zdrzeni-podani', 'blok-cloneni', 'postaveni-rotace', 'mic-v-poli', 'mic-v-autu', 'zadrzeny-mic', 'dvoji-dotek', 'ctyri-odbiti', 'dotek-site', 'presah', 'chyba-utoku', 'prusnik-cara', 'dvojita-chyba', 'dotek-mice', 'zdrzovani-napomenuti', 'zdrzovani-trest', 'carovy-v-poli', 'carovy-v-autu', 'carovy-dotek', 'carovy-prostor', 'carovy-nelze');

-- ---------------------------------------------------------------------
-- zacni_hru(hra, sada) → { kolo_id, polozky: [id gest] }
-- Kolo kvízu gest nebo Gesta naopak: 10 náhodných gest (sada = skupina
-- 'rozhodci' / 'carovi', null = všechna). Gesta vybírá server, aby si hráč
-- nemohl vybrat jen ta, která zná. Hrát může i nepřihlášený (bez bodů).
-- ---------------------------------------------------------------------
create or replace function public.zacni_hru(p_hra text, p_sada text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_polozky text[];
  v_kolo_id uuid;
begin
  if p_hra is null or p_hra not in ('gesta', 'gesto-naopak') then
    raise exception 'Neznámá hra.';
  end if;
  if p_sada is not null and p_sada not in ('rozhodci', 'carovi') then
    raise exception 'Neznámá sada gest.';
  end if;

  -- úklid: kola, která nikdo neodevzdal do 1 dne (stejně jako zacni_kolo)
  delete from public.kola
  where konec is null and zacatek < now() - interval '1 day';

  select coalesce(array_agg(v.id), '{}')
  into v_polozky
  from (
    select g.id from private.gesta g
    where p_sada is null or g.skupina = p_sada
    order by random()
    limit 10
  ) as v;

  insert into public.kola (uzivatel_id, hra, rezim, otazky, polozky, pocet)
  values (auth.uid(), p_hra, 'bezne', '{}', v_polozky, cardinality(v_polozky))
  returning id into v_kolo_id;

  return jsonb_build_object('kolo_id', v_kolo_id, 'polozky', to_jsonb(v_polozky));
end;
$$;

-- ---------------------------------------------------------------------
-- odevzdej_hru(kolo_id, odpovedi) → { skore, pocet, trvani_s, body, body_duvod }
-- odpovedi = { "id gesta": "id zvoleného gesta" }; správně = shoda.
-- Skóre, čas i body počítá server.
-- ---------------------------------------------------------------------
create or replace function public.odevzdej_hru(p_kolo_id uuid, p_odpovedi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo    public.kola;
  v_skore   integer;
  v_ulozene jsonb;
  v_body    jsonb;
begin
  select * into v_kolo
  from public.kola
  where id = p_kolo_id
  for update;   -- dvě současná odevzdání se nepotkají

  if not found
     or v_kolo.konec is not null
     or v_kolo.uzivatel_id is distinct from auth.uid()
     or v_kolo.hra = 'kviz' then
    raise exception 'Kolo neexistuje nebo už bylo odevzdané.';
  end if;
  if jsonb_typeof(p_odpovedi) is distinct from 'object' then
    raise exception 'Neplatný formát odpovědí.';
  end if;

  select count(*) filter (where (p_odpovedi ->> p.id) = p.id),
         -- uložíme jen odpovědi na položky tohoto kola
         coalesce(jsonb_object_agg(p.id, p_odpovedi ->> p.id), '{}')
  into v_skore, v_ulozene
  from unnest(v_kolo.polozky) as p (id);

  update public.kola
  set konec = now(), skore = v_skore, odpovedi = v_ulozene
  where id = p_kolo_id;

  v_body := private.prirad_body(p_kolo_id);

  return jsonb_build_object(
    'skore', v_skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from now() - v_kolo.zacatek))::integer,
    'body', v_body -> 'body',
    'body_duvod', v_body -> 'duvod');
end;
$$;

-- ---------------------------------------------------------------------
-- zebricek_body(obdobi, hra, limit) → pořadí hráčů podle součtu bodů
--   obdobi: 'celkem' (celá doba), 'tyden' (od pondělí), 'den' (dnes);
--           český čas, nový den začíná o půlnoci v ČR
--   hra:    null = všechny hry, jinak jen jedna ('kviz' vč. denní výzvy, 'gesta'…)
-- Při shodě bodů je výš ten, kdo součtu dosáhl dřív (dřívější poslední zisk).
-- ---------------------------------------------------------------------
drop function if exists public.zebricek_body(text, text, integer);

create or replace function public.zebricek_body(
  p_obdobi text default 'celkem',
  p_hra text default null,
  p_limit integer default 50
)
returns table (
  poradi     bigint,
  prezdivka  text,
  body       bigint,
  kol        bigint,
  je_moje    boolean,
  odznaky    text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with soucty as (
    select k.uzivatel_id,
           sum(k.body) as body,
           count(*) as kol,
           max(k.konec) as dosazeno
    from public.kola k
    where k.body > 0
      and k.uzivatel_id is not null
      and (p_hra is null or k.hra = p_hra)
      and case p_obdobi
            when 'den'   then (k.konec at time zone 'Europe/Prague')::date = private.dnes()
            -- isodow: pondělí = 1 → odečíst 0 dní, neděle = 7 → 6 dní
            when 'tyden' then (k.konec at time zone 'Europe/Prague')::date
                              >= private.dnes() - (extract(isodow from private.dnes())::integer - 1)
            else true
          end
    group by k.uzivatel_id
  )
  select
    rank() over (order by s.body desc, s.dosazeno asc),
    p.prezdivka,
    s.body,
    s.kol,
    coalesce(s.uzivatel_id = auth.uid(), false),
    p.vybrane_odznaky
  from soucty s
  join public.profily p on p.id = s.uzivatel_id
  order by s.body desc, s.dosazeno asc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- moje_body() → { celkem, tyden, dnes, dnes_hrano: ["kviz/bezne", …] }
-- Body přihlášeného hráče a které hry už dnes daly bodované kolo
-- (karty v Hrách ukážou „dnešní body získány“).
-- ---------------------------------------------------------------------
create or replace function public.moje_body()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'celkem', coalesce(sum(k.body), 0),
    'tyden',  coalesce(sum(k.body) filter (
                where (k.konec at time zone 'Europe/Prague')::date
                      >= private.dnes() - (extract(isodow from private.dnes())::integer - 1)), 0),
    'dnes',   coalesce(sum(k.body) filter (
                where (k.konec at time zone 'Europe/Prague')::date = private.dnes()), 0),
    'dnes_hrano', coalesce(jsonb_agg(distinct k.hra || '/' || k.rezim) filter (
                where (k.konec at time zone 'Europe/Prague')::date = private.dnes()
                  and k.body_duvod is null), '[]'::jsonb))
  from public.kola k
  where k.uzivatel_id = auth.uid() and k.body is not null;
$$;

-- ---------------------------------------------------------------------
-- Přepočet starších kol: body pro kola odehraná před zavedením bodů
-- (body is null). Stejná pravidla jako private.prirad_body: příliš rychlé
-- kolo 0 ('rychle'), z ostatních dostane body jen prvních
-- denni_limit_kol() kol každé hry a režimu za den, další 0 ('limit').
-- Nová kola mají body hned, takže opakované spuštění nic nezmění.
-- ---------------------------------------------------------------------
with kandidati as (
  select k.id,
         k.konec - k.zacatek < make_interval(secs => k.pocet * 2) as rychle,
         row_number() over (
           partition by k.uzivatel_id, k.hra, k.rezim, (k.konec at time zone 'Europe/Prague')::date
           order by k.konec - k.zacatek < make_interval(secs => k.pocet * 2), k.konec
         ) as poradi
  from public.kola k
  join private.hodnoty_her h on h.hra = k.hra and h.rezim = k.rezim
  where k.konec is not null and k.uzivatel_id is not null
)
update public.kola k
set body = case
             when c.rychle then 0
             when c.poradi <= private.denni_limit_kol()
               then private.body_za(k.hra, k.rezim, k.skore, k.pocet, k.konec - k.zacatek)
             else 0
           end,
    body_duvod = case
                   when c.rychle then 'rychle'
                   when c.poradi <= private.denni_limit_kol() then null
                   else 'limit'
                 end
from kandidati c
where c.id = k.id and k.body is null;

-- ---------------------------------------------------------------------
-- Kdo smí funkce volat (deny by default, viz konec 01_schema.sql)
-- ---------------------------------------------------------------------
revoke all on function public.zacni_hru(text, text)               from public, anon, authenticated;
revoke all on function public.odevzdej_hru(uuid, jsonb)           from public, anon, authenticated;
revoke all on function public.zebricek_body(text, text, integer)  from public, anon, authenticated;
revoke all on function public.moje_body()                         from public, anon, authenticated;

grant execute on function public.zacni_hru(text, text)               to anon, authenticated;
grant execute on function public.odevzdej_hru(uuid, jsonb)           to anon, authenticated;
grant execute on function public.zebricek_body(text, text, integer)  to anon, authenticated;
grant execute on function public.moje_body()                         to authenticated;
