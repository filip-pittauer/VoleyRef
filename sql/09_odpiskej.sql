-- =====================================================================
-- 09_odpiskej.sql – hra „Odpískej to!“ (hra 'odpiskej')
-- Spusť po 01–08. Jde spustit i opakovaně. Situace nahraje
-- private/seed-odpiskej.sql (node tools/seed-odpiskej.mjs).
--
-- Hráč je 1. nebo 2. rozhodčí a skládá posloupnost gest ve správném
-- pořadí (pravidlo 22.2.3). Správná gesta jsou jako u kvízu tajná
-- (schéma private), řešení hráč uvidí až na konci kola.
-- Situace jsou zatím text; později je nahradí animace (docs/animace-poznamky.md).
-- =====================================================================

create table if not exists public.odpiskej_situace (
  id       integer primary key,
  aktivni  boolean not null default true,
  kdo      smallint not null check (kdo in (1, 2)),   -- kdo píská: 1. nebo 2. rozhodčí
  text     text not null
);

create table if not exists private.odpiskej_reseni (
  situace_id  integer primary key references public.odpiskej_situace (id) on delete cascade,
  spravne     text[] not null,      -- id gest z gesta/gesta.json ve správném pořadí
  vysvetleni  text not null,
  pravidlo    text
);

-- deny by default: z webu jen přes funkce níže
alter table public.odpiskej_situace  enable row level security;
alter table private.odpiskej_reseni  enable row level security;

-- ---------------------------------------------------------------------
-- zacni_odpiskej() → { kolo_id, situace: [{ id, kdo, text }] }
-- 10 náhodných aktivních situací. Hrát může i nepřihlášený (bez bodů).
-- ---------------------------------------------------------------------
create or replace function public.zacni_odpiskej()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_situace jsonb;
  v_ids     text[];
  v_kolo_id uuid;
begin
  -- úklid: kola, která nikdo neodevzdal do 1 dne (stejně jako zacni_kolo)
  delete from public.kola
  where konec is null and zacatek < now() - interval '1 day';

  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'kdo', v.kdo, 'text', v.text)), '[]'),
         coalesce(array_agg(v.id::text), '{}')
  into v_situace, v_ids
  from (
    select s.id, s.kdo, s.text
    from public.odpiskej_situace s
    where s.aktivni
      and exists (select 1 from private.odpiskej_reseni r where r.situace_id = s.id)
    order by random()
    limit 10
  ) as v;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('kolo_id', null, 'situace', '[]'::jsonb);
  end if;

  insert into public.kola (uzivatel_id, hra, rezim, otazky, polozky, pocet)
  values (auth.uid(), 'odpiskej', 'bezne', '{}', v_ids, cardinality(v_ids))
  returning id into v_kolo_id;

  return jsonb_build_object('kolo_id', v_kolo_id, 'situace', v_situace);
end;
$$;

-- ---------------------------------------------------------------------
-- odevzdej_odpiskej(kolo_id, odpovedi) → { skore, pocet, trvani_s, body, body_duvod, vysledky }
-- odpovedi = { "id situace": ["id gesta", …] }; správně = přesně stejná
-- gesta ve stejném pořadí. vysledky = [{ id, odpoved, spravne, je_spravne,
-- vysvetleni, pravidlo }] – kolo je hotové, řešení už nic neprozradí.
-- ---------------------------------------------------------------------
create or replace function public.odevzdej_odpiskej(p_kolo_id uuid, p_odpovedi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo     public.kola;
  v_skore    integer;
  v_vysledky jsonb;
  v_body     jsonb;
begin
  select * into v_kolo
  from public.kola
  where id = p_kolo_id
  for update;   -- dvě současná odevzdání se nepotkají

  if not found
     or v_kolo.konec is not null
     or v_kolo.uzivatel_id is distinct from auth.uid()
     or v_kolo.hra <> 'odpiskej' then
    raise exception 'Kolo neexistuje nebo už bylo odevzdané.';
  end if;
  if jsonb_typeof(p_odpovedi) is distinct from 'object' then
    raise exception 'Neplatný formát odpovědí.';
  end if;

  select count(*) filter (where (p_odpovedi -> p.id) = to_jsonb(r.spravne)),
         jsonb_agg(jsonb_build_object(
           'id', p.id::integer,
           'odpoved', coalesce(p_odpovedi -> p.id, '[]'::jsonb),
           'spravne', to_jsonb(r.spravne),
           'je_spravne', coalesce((p_odpovedi -> p.id) = to_jsonb(r.spravne), false),
           'vysvetleni', r.vysvetleni,
           'pravidlo', r.pravidlo) order by p.poradi)
  into v_skore, v_vysledky
  from unnest(v_kolo.polozky) with ordinality as p (id, poradi)
  join private.odpiskej_reseni r on r.situace_id = p.id::integer;

  update public.kola
  set konec = now(), skore = v_skore,
      odpovedi = (select coalesce(jsonb_object_agg(p.id, p_odpovedi -> p.id), '{}')
                  from unnest(v_kolo.polozky) as p (id) where p_odpovedi ? p.id)
  where id = p_kolo_id;

  v_body := private.prirad_body(p_kolo_id);

  return jsonb_build_object(
    'skore', v_skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from now() - v_kolo.zacatek))::integer,
    'body', v_body -> 'body',
    'body_duvod', v_body -> 'duvod',
    'vysledky', v_vysledky);
end;
$$;

-- ---------------------------------------------------------------------
-- Kdo smí funkce volat (deny by default, viz konec 01_schema.sql)
-- ---------------------------------------------------------------------
revoke all on function public.zacni_odpiskej()                  from public, anon, authenticated;
revoke all on function public.odevzdej_odpiskej(uuid, jsonb)    from public, anon, authenticated;

grant execute on function public.zacni_odpiskej()               to anon, authenticated;
grant execute on function public.odevzdej_odpiskej(uuid, jsonb) to anon, authenticated;
