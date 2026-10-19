-- =====================================================================
-- 04_denni_vyzva.sql – denní žebříček, stav výzvy a série dní v řadě
-- Spusť po 01 a 02. Jde spustit i opakovaně (create or replace).
-- Samotné spuštění denní výzvy je v zacni_kolo (02_funkce.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- private.denni_poradi(den) → pořadí hráčů v denní výzvě daného dne
-- Stejná pravidla jako celkový žebříček: přihlášení hráči, aspoň 3 s
-- na otázku. Každý hráč má na den jen jedno kolo (jedinečný index).
-- ---------------------------------------------------------------------
create or replace function private.denni_poradi(p_den date)
returns table (
  uzivatel_id  uuid,
  skore        smallint,
  pocet        smallint,
  trvani       interval,
  konec        timestamptz,
  poradi       bigint
)
language sql
stable
set search_path = ''
as $$
  select
    k.uzivatel_id,
    k.skore,
    k.pocet,
    k.konec - k.zacatek,
    k.konec,
    rank() over (order by k.skore desc, k.konec - k.zacatek asc)
  from public.kola k
  where k.rezim = 'denni'
    and k.den = p_den
    and k.konec is not null
    and k.uzivatel_id is not null
    and k.konec - k.zacatek >= make_interval(secs => k.pocet * 3);
$$;

-- ---------------------------------------------------------------------
-- private.denni_serie(uzivatel) → { aktualni, nejdelsi }
-- Kolik dní v řadě hráč odehrál denní výzvu. Aktuální série platí,
-- pokud hrál dnes nebo včera (dnešek ještě může dohrát).
-- ---------------------------------------------------------------------
create or replace function private.denni_serie(p_uzivatel uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with dny as (
    select distinct k.den
    from public.kola k
    where k.uzivatel_id = p_uzivatel and k.rezim = 'denni' and k.konec is not null
  ),
  -- „mezery a ostrovy“: u dní jdoucích po sobě je den − pořadí stejné číslo
  ostrovy as (
    select den, den - (row_number() over (order by den))::integer as skupina
    from dny
  ),
  serie as (
    select max(den) as posledni_den, count(*)::integer as delka
    from ostrovy
    group by skupina
  )
  select jsonb_build_object(
    'aktualni', coalesce((
      select s.delka from serie s
      where s.posledni_den >= private.dnes() - 1
      order by s.posledni_den desc
      limit 1), 0),
    'nejdelsi', coalesce((select max(s.delka) from serie s), 0)
  );
$$;

revoke all on function private.denni_poradi(date) from public, anon, authenticated;
revoke all on function private.denni_serie(uuid)  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- denni_zebricek(limit) → dnešní pořadí
-- ---------------------------------------------------------------------
create or replace function public.denni_zebricek(p_limit integer default 50)
returns table (
  poradi     bigint,
  prezdivka  text,
  skore      smallint,
  pocet      smallint,
  trvani_s   integer,
  je_moje    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.poradi,
    p.prezdivka,
    d.skore,
    d.pocet,
    round(extract(epoch from d.trvani))::integer,
    coalesce(d.uzivatel_id = auth.uid(), false)
  from private.denni_poradi(private.dnes()) d
  join public.profily p on p.id = d.uzivatel_id
  order by d.poradi, d.konec
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- stav_denni_vyzvy() → stav dnešní výzvy pro úvodní obrazovku kvízu
-- {
--   den, hracu (kolik hráčů je dnes v žebříčku),
--   stav: 'nehrano' | 'rozehrano' | 'odehrano',
--   skore, pocet, trvani_s, poradi (null = nezapočítáno, např. moc rychlé),
--   serie: { aktualni, nejdelsi }  (jen přihlášený)
-- }
-- ---------------------------------------------------------------------
create or replace function public.stav_denni_vyzvy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_den     date := private.dnes();
  v_kolo    public.kola;
  v_poradi  bigint;
begin
  if auth.uid() is not null then
    select * into v_kolo
    from public.kola k
    where k.uzivatel_id = auth.uid() and k.rezim = 'denni' and k.den = v_den;

    if v_kolo.konec is not null then
      select d.poradi into v_poradi
      from private.denni_poradi(v_den) d
      where d.uzivatel_id = auth.uid();
    end if;
  end if;

  return jsonb_build_object(
    'den', v_den,
    'hracu', (select count(*) from private.denni_poradi(v_den)),
    'stav', case
              when v_kolo.id is null then 'nehrano'
              when v_kolo.konec is null then 'rozehrano'
              else 'odehrano'
            end,
    'skore', v_kolo.skore,
    'pocet', v_kolo.pocet,
    'trvani_s', round(extract(epoch from v_kolo.konec - v_kolo.zacatek))::integer,
    'poradi', v_poradi,
    'serie', case when auth.uid() is not null then private.denni_serie(auth.uid()) end
  );
end;
$$;

revoke all on function public.denni_zebricek(integer) from public, anon, authenticated;
revoke all on function public.stav_denni_vyzvy()      from public, anon, authenticated;

grant execute on function public.denni_zebricek(integer) to anon, authenticated;
grant execute on function public.stav_denni_vyzvy()      to anon, authenticated;
