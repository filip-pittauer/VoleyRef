-- =====================================================================
-- 08_rotace.sql – Rotační sprint (hra 'rotace'): 60 s, co nejvíc situací
-- Spusť po 01–07. Jde spustit i opakovaně.
--
-- Situace i řešení počítá server, prohlížeč posílá jen sestavy hráče.
-- Stejná pravidla má js/rotation-logic.js (okamžitá zpětná vazba ve hře);
-- test rotace-db hlídá, že obě strany dávají stejná řešení.
--
-- Situace (jsonb): { typ: 'rotace'|'stridani'|'libero'|'vice',
--   sestava: [6 čísel v zónách I–VI], udalost?: 'prijem-vyhra'|'prijem-prohra'|
--   'podani-vyhra'|'podani-prohra', kroky?: počet rotací (typ 'vice'),
--   libero?: { cislo, za }, stridani?: { ven, dovnitr } }
-- =====================================================================

-- ---------------------------------------------------------------------
-- sprint_reseni(situace) → sestava po situaci (zóny I–VI)
-- Rotace (7.6.2): jen když družstvo přijímalo a vyhrálo výměnu; hráč ze
-- zóny II jde do I, z I do VI… Libero, které se dostane do zóny IV, musí
-- ven a vrací se hráč, za kterého hrálo (19.3.1.2, 19.3.2.2). Střídání až
-- po výměně.
-- ---------------------------------------------------------------------
create or replace function private.sprint_reseni(p_situace jsonb)
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sestava integer[];
  v_kroky   integer;
begin
  select array_agg(x.cislo::integer order by x.poradi)
  into v_sestava
  from jsonb_array_elements_text(p_situace -> 'sestava') with ordinality as x (cislo, poradi);

  v_kroky := case
               when p_situace ->> 'typ' = 'vice' then (p_situace ->> 'kroky')::integer
               when p_situace ->> 'udalost' = 'prijem-vyhra' then 1
               else 0
             end;

  for i in 1 .. v_kroky loop
    v_sestava := v_sestava[2:6] || v_sestava[1:1];   -- nové I = staré II … nové VI = staré I
    if jsonb_typeof(p_situace -> 'libero') = 'object'
       and v_sestava[4] = (p_situace -> 'libero' ->> 'cislo')::integer then
      v_sestava[4] := (p_situace -> 'libero' ->> 'za')::integer;
    end if;
  end loop;

  if jsonb_typeof(p_situace -> 'stridani') = 'object' then
    v_sestava := array_replace(v_sestava, (p_situace -> 'stridani' ->> 'ven')::integer,
                                          (p_situace -> 'stridani' ->> 'dovnitr')::integer);
  end if;
  return v_sestava;
end;
$$;

-- ---------------------------------------------------------------------
-- sprint_situace(poradi) → náhodná situace; obtížnost roste s pořadím:
-- 1–4 rotace/bez rotace, 5–8 střídání, 9–12 libero, dál mix + více rotací.
-- ---------------------------------------------------------------------
create or replace function private.sprint_situace(p_poradi integer)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_cisla   integer[];
  v_sestava integer[];
  v_typ     text;
  v_udalost text;
  v_zona    integer;
  v_zony    integer[];
begin
  -- 8 různých čísel dresů 1–20: 6 na hřišti, 1 do střídání, 1 libero
  select array_agg(n order by random()) into v_cisla from generate_series(1, 20) as n;
  v_sestava := v_cisla[1:6];

  v_typ := case
             when p_poradi <= 4 then 'rotace'
             when p_poradi <= 8 then 'stridani'
             when p_poradi <= 12 then 'libero'
             else (array['rotace', 'stridani', 'libero', 'vice', 'vice'])[1 + floor(random() * 5)::integer]
           end;
  -- polovina „rotuje“, zbytek chytáky bez rotace
  v_udalost := case when random() < 0.5 then 'prijem-vyhra'
                    else (array['prijem-prohra', 'podani-vyhra', 'podani-prohra'])[1 + floor(random() * 3)::integer] end;

  if v_typ = 'vice' then
    return jsonb_build_object('typ', v_typ, 'sestava', to_jsonb(v_sestava), 'kroky', 2 + floor(random() * 3)::integer);
  elsif v_typ = 'stridani' then
    return jsonb_build_object('typ', v_typ, 'sestava', to_jsonb(v_sestava),
      'udalost', case when random() < 0.5 then 'prijem-vyhra' end,
      'stridani', jsonb_build_object('ven', v_sestava[1 + floor(random() * 6)::integer], 'dovnitr', v_cisla[7]));
  elsif v_typ = 'libero' then
    if random() < 0.7 then v_udalost := 'prijem-vyhra'; end if;
    -- libero nesmí podávat (19.3.1.3) → při našem podání ne v zóně I;
    -- často v zóně V, odkud po rotaci musí ven
    v_zony := case when v_udalost like 'podani%' then array[5, 6] else array[5, 5, 6, 1] end;
    v_zona := v_zony[1 + floor(random() * cardinality(v_zony))::integer];
    return jsonb_build_object('typ', v_typ, 'udalost', v_udalost,
      'libero', jsonb_build_object('cislo', v_cisla[8], 'za', v_sestava[v_zona]),
      'sestava', to_jsonb(v_sestava[1:v_zona - 1] || v_cisla[8] || v_sestava[v_zona + 1:6]));
  end if;
  return jsonb_build_object('typ', v_typ, 'sestava', to_jsonb(v_sestava), 'udalost', v_udalost);
end;
$$;

-- ---------------------------------------------------------------------
-- zacni_sprint() → { kolo_id, limit_s, situace: [...] }
-- 30 situací (víc než kdo stihne za 60 s); čas startu uloží server.
-- ---------------------------------------------------------------------
create or replace function public.zacni_sprint()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_situace jsonb;
  v_kolo_id uuid;
begin
  -- úklid: kola, která nikdo neodevzdal do 1 dne (stejně jako zacni_kolo)
  delete from public.kola
  where konec is null and zacatek < now() - interval '1 day';

  select jsonb_agg(private.sprint_situace(i) order by i) into v_situace
  from generate_series(1, 30) as i;

  insert into public.kola (uzivatel_id, hra, rezim, otazky, data, pocet)
  values (auth.uid(), 'rotace', 'bezne', '{}', v_situace, jsonb_array_length(v_situace))
  returning id into v_kolo_id;

  return jsonb_build_object(
    'kolo_id', v_kolo_id,
    'limit_s', (select h.casovy_limit_s from private.hodnoty_her h where h.hra = 'rotace' and h.rezim = 'bezne'),
    'situace', v_situace);
end;
$$;

-- ---------------------------------------------------------------------
-- odevzdej_sprint(kolo_id, odpovedi) → { skore, pocet, trvani_s, body, body_duvod, reseni }
-- odpovedi = { "0": [6 čísel], "1": [...], … } jen pro zodpovězené situace
-- (pořadí od 0, bez mezer). pocet = kolik situací hráč stihl.
-- reseni = správné sestavy zodpovězených situací (kolo je hotové, nic neprozradí).
-- ---------------------------------------------------------------------
create or replace function public.odevzdej_sprint(p_kolo_id uuid, p_odpovedi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kolo    public.kola;
  v_pocet   integer;
  v_skore   integer;
  v_reseni  jsonb;
  v_body    jsonb;
begin
  select * into v_kolo
  from public.kola
  where id = p_kolo_id
  for update;   -- dvě současná odevzdání se nepotkají

  if not found
     or v_kolo.konec is not null
     or v_kolo.uzivatel_id is distinct from auth.uid()
     or v_kolo.hra <> 'rotace' then
    raise exception 'Kolo neexistuje nebo už bylo odevzdané.';
  end if;
  if jsonb_typeof(p_odpovedi) is distinct from 'object' then
    raise exception 'Neplatný formát odpovědí.';
  end if;

  -- zodpovězené situace = souvislá řada od 0 (sprint jde popořadě)
  select count(*) into v_pocet
  from generate_series(0, jsonb_array_length(v_kolo.data) - 1) as i
  where p_odpovedi ? i::text;

  select count(*) filter (where (p_odpovedi -> i::text) = to_jsonb(private.sprint_reseni(v_kolo.data -> i))),
         coalesce(jsonb_agg(to_jsonb(private.sprint_reseni(v_kolo.data -> i)) order by i), '[]'::jsonb)
  into v_skore, v_reseni
  from generate_series(0, v_pocet - 1) as i;

  update public.kola
  set konec = now(), skore = v_skore, pocet = v_pocet,
      -- uložíme jen odpovědi na situace tohoto kola
      odpovedi = (select coalesce(jsonb_object_agg(i::text, p_odpovedi -> i::text), '{}')
                  from generate_series(0, v_pocet - 1) as i)
  where id = p_kolo_id;

  v_body := private.prirad_body(p_kolo_id);

  return jsonb_build_object(
    'skore', v_skore,
    'pocet', v_pocet,
    'trvani_s', round(extract(epoch from now() - v_kolo.zacatek))::integer,
    'body', v_body -> 'body',
    'body_duvod', v_body -> 'duvod',
    'reseni', v_reseni);
end;
$$;

-- ---------------------------------------------------------------------
-- Kdo smí funkce volat (deny by default, viz konec 01_schema.sql)
-- ---------------------------------------------------------------------
revoke all on function private.sprint_reseni(jsonb)            from public, anon, authenticated;
revoke all on function private.sprint_situace(integer)         from public, anon, authenticated;
revoke all on function public.zacni_sprint()                   from public, anon, authenticated;
revoke all on function public.odevzdej_sprint(uuid, jsonb)     from public, anon, authenticated;

grant execute on function public.zacni_sprint()                to anon, authenticated;
grant execute on function public.odevzdej_sprint(uuid, jsonb)  to anon, authenticated;
