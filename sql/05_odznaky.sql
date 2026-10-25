-- =====================================================================
-- 05_odznaky.sql – odznaky: podmínky, udělování, výběr do žebříčku
-- Spusť po 01–04. Jde spustit i opakovaně (create or replace).
--
-- Názvy a ikony odznaků jsou v js/badges.js, tady jsou jen jejich id
-- a podmínky. Nový odznak = řádek v metriky_odznaku + položka v badges.js.
-- =====================================================================

-- ---------------------------------------------------------------------
-- private.metriky_odznaku(uzivatel) → (odznak, hodnota, cil)
-- Pro každý odznak: kolik hráč má (hodnota) a kolik potřebuje (cil).
-- Odznak je získaný, když hodnota >= cil.
-- „Dokonalá“ kola musí mít aspoň 2 s na otázku (stejně jako žebříček).
-- ---------------------------------------------------------------------
create or replace function private.metriky_odznaku(p_uzivatel uuid)
returns table (odznak text, hodnota integer, cil integer)
language sql
stable
set search_path = ''
as $$
  with moje_kola as (
    select k.*, k.konec - k.zacatek as trvani
    from public.kola k
    where k.uzivatel_id = p_uzivatel and k.konec is not null
  ),
  -- běžné kolo s aspoň 10 otázkami bez chyby
  dokonala as (
    select * from moje_kola
    where rezim = 'bezne' and pocet >= 10 and skore = pocet
      and trvani >= make_interval(secs => pocet * 2)
  ),
  -- úspěšnost po kategoriích (jako ve statistikách, bez dnešní denní výzvy –
  -- postup odznaku by jinak prozradil, které otázky byly správně)
  kategorie as (
    select o.kategorie,
           count(*) as otazek,
           count(*) filter (where (k.odpovedi ->> u.id::text) = r.spravna) as spravne
    from moje_kola k
    cross join lateral unnest(k.otazky) as u (id)
    join public.otazky o on o.id = u.id
    join private.otazky_reseni r on r.otazka_id = u.id
    where not private.reseni_skryte(k.rezim, k.den)
    group by o.kategorie
  ),
  serie as (
    select private.denni_serie(p_uzivatel) as s
  ),
  -- nejlepší umístění v denní výzvě – jen uzavřené dny (dnešek se ještě mění)
  umisteni as (
    select min(d.poradi) as nejlepsi
    from (select distinct den from moje_kola where rezim = 'denni' and den < private.dnes()) as dny
    cross join lateral private.denni_poradi(dny.den) as d
    where d.uzivatel_id = p_uzivatel
  )
  select m.odznak, m.hodnota, m.cil
  from (values
    -- začátky a vytrvalost
    ('prvni-kolo',  (select count(*) from moje_kola)::integer, 1),
    ('kol-10',      (select count(*) from moje_kola)::integer, 10),
    ('kol-50',      (select count(*) from moje_kola)::integer, 50),
    ('otazek-100',  (select coalesce(sum(pocet), 0) from moje_kola)::integer, 100),
    ('otazek-500',  (select coalesce(sum(pocet), 0) from moje_kola)::integer, 500),
    -- přesnost
    ('bez-chyby',   (select count(*) from dokonala)::integer, 1),
    ('neomylny',    (select count(*) from dokonala)::integer, 5),
    ('rychly',      (select count(*) from dokonala where trvani < interval '2 minutes')::integer, 1),
    ('tezka-vaha',  (select count(*) from moje_kola
                     where rezim = 'bezne' and obtiznost = 3 and pocet >= 3 and skore = pocet
                       and trvani >= make_interval(secs => pocet * 2))::integer, 1),
    -- učení
    ('pouceny',     (select coalesce(sum(skore), 0) from moje_kola where rezim = 'chyby')::integer, 10),
    ('cisty-stul',  (case when exists (select 1 from moje_kola where rezim = 'chyby' and skore > 0)
                           and not exists (select 1 from private.chybne_otazky(p_uzivatel))
                          then 1 else 0 end), 1),
    ('vsestranny',  (select count(*) from kategorie where otazek >= 5 and spravne >= 0.7 * otazek)::integer, 11),
    ('specialista', (select count(*) from kategorie where otazek >= 15 and spravne >= 0.9 * otazek)::integer, 1),
    ('zkouska',     (select count(*) from moje_kola
                     where rezim = 'zkouska' and private.zkouska_splnena(skore, pocet, trvani))::integer, 1),
    -- denní výzva
    ('denni-hrac',  (select count(*) from moje_kola where rezim = 'denni')::integer, 1),
    ('serie-3',     (select (s ->> 'nejdelsi')::integer from serie), 3),
    ('serie-7',     (select (s ->> 'nejdelsi')::integer from serie), 7),
    ('stupne',      (select case when nejlepsi <= 3 then 1 else 0 end from umisteni), 1),
    ('vitez-dne',   (select case when nejlepsi = 1 then 1 else 0 end from umisteni), 1)
  ) as m (odznak, hodnota, cil);
$$;

-- ---------------------------------------------------------------------
-- private.udel_odznaky(uzivatel) → id nově získaných odznaků
-- Zapíše odznaky, jejichž podmínka je splněná a hráč je ještě nemá.
-- Volá se po každém odevzdaném kole a při zobrazení odznaků.
-- ---------------------------------------------------------------------
create or replace function private.udel_odznaky(p_uzivatel uuid)
returns text[]
language sql
volatile
set search_path = ''
as $$
  with nove as (
    insert into public.odznaky_hracu (uzivatel_id, odznak)
    select p_uzivatel, m.odznak
    from private.metriky_odznaku(p_uzivatel) m
    where m.hodnota >= m.cil
    on conflict do nothing
    returning odznak
  )
  select coalesce(array_agg(nove.odznak), '{}') from nove;
$$;

revoke all on function private.metriky_odznaku(uuid) from public, anon, authenticated;
revoke all on function private.udel_odznaky(uuid)    from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- moje_odznaky() → { odznaky: [{ id, hodnota, cil, ziskano }], vybrane: [...] }
-- Přehled pro stránku Statistiky (získané i rozpracované) a pro výběr
-- do žebříčku na stránce Účet.
-- ---------------------------------------------------------------------
create or replace function public.moje_odznaky()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nejsi přihlášený.';
  end if;

  -- např. „Vítěz dne“ za včerejšek se udělí až teď (den se mezitím uzavřel)
  perform private.udel_odznaky(auth.uid());

  return jsonb_build_object(
    'odznaky', (
      select jsonb_agg(jsonb_build_object(
               'id', m.odznak,
               'hodnota', least(m.hodnota, m.cil),
               'cil', m.cil,
               'ziskano', o.ziskano))
      from private.metriky_odznaku(auth.uid()) m
      left join public.odznaky_hracu o
        on o.uzivatel_id = auth.uid() and o.odznak = m.odznak
    ),
    'vybrane', (select p.vybrane_odznaky from public.profily p where p.id = auth.uid())
  );
end;
$$;

-- ---------------------------------------------------------------------
-- nastav_odznaky(odznaky) – výběr až 3 získaných odznaků do žebříčku
-- ---------------------------------------------------------------------
create or replace function public.nastav_odznaky(p_odznaky text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_odznaky text[] := coalesce(p_odznaky, '{}');
begin
  if auth.uid() is null then
    raise exception 'Nejsi přihlášený.';
  end if;
  if cardinality(v_odznaky) > 3 then
    raise exception 'Vybrat jde nejvýše 3 odznaky.';
  end if;
  if cardinality(v_odznaky) <> (select count(distinct x) from unnest(v_odznaky) as x) then
    raise exception 'Odznak je vybraný dvakrát.';
  end if;
  if exists (
    select 1 from unnest(v_odznaky) as x
    where not exists (
      select 1 from public.odznaky_hracu o
      where o.uzivatel_id = auth.uid() and o.odznak = x)
  ) then
    raise exception 'Tento odznak ještě nemáš.';
  end if;

  update public.profily set vybrane_odznaky = v_odznaky where id = auth.uid();
  return v_odznaky;
end;
$$;

revoke all on function public.moje_odznaky()          from public, anon, authenticated;
revoke all on function public.nastav_odznaky(text[])  from public, anon, authenticated;

grant execute on function public.moje_odznaky()         to authenticated;
grant execute on function public.nastav_odznaky(text[]) to authenticated;
