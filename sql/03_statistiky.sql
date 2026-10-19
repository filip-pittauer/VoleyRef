-- =====================================================================
-- 03_statistiky.sql – statistiky přihlášeného hráče
-- Spusť po 01 a 02. Jde spustit i opakovaně (create or replace).
-- Nemění tabulky, jen přidává jednu funkci.
-- =====================================================================

-- ---------------------------------------------------------------------
-- moje_statistiky() → {
--   souhrn:    { kol, otazek, spravne, nejlepsi_skore, nejlepsi_pocet, cas_s },
--   kategorie: [{ kategorie, otazek, spravne }],
--   posledni:  [{ datum, kategorie, skore, pocet, trvani_s }]   (posledních 10 kol)
-- }
-- Úspěšnost v kategoriích se počítá ze správných odpovědí, které hráč
-- nesmí vidět (private schéma) – proto to musí spočítat server.
-- ---------------------------------------------------------------------
create or replace function public.moje_statistiky()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uzivatel uuid := auth.uid();
begin
  if v_uzivatel is null then
    raise exception 'Nejsi přihlášený.';
  end if;

  return jsonb_build_object(
    'souhrn', (
      select jsonb_build_object(
        'kol', count(*),
        'otazek', coalesce(sum(k.pocet), 0),
        'spravne', coalesce(sum(k.skore), 0),
        'cas_s', coalesce(round(extract(epoch from sum(k.konec - k.zacatek)))::integer, 0)
      )
      from public.kola k
      where k.uzivatel_id = v_uzivatel and k.konec is not null
    ),

    -- nejlepší kolo = nejvyšší podíl správných, při shodě rychlejší
    'nejlepsi', (
      select jsonb_build_object('skore', k.skore, 'pocet', k.pocet,
               'trvani_s', round(extract(epoch from k.konec - k.zacatek))::integer)
      from public.kola k
      where k.uzivatel_id = v_uzivatel and k.konec is not null
      order by k.skore::numeric / k.pocet desc, k.konec - k.zacatek asc
      limit 1
    ),

    'kategorie', (
      select coalesce(jsonb_agg(
               jsonb_build_object('kategorie', x.kategorie, 'otazek', x.otazek, 'spravne', x.spravne)
               order by x.kategorie), '[]'::jsonb)
      from (
        select o.kategorie,
               count(*) as otazek,
               count(*) filter (where (k.odpovedi ->> u.id::text) = r.spravna) as spravne
        from public.kola k
        cross join lateral unnest(k.otazky) as u (id)
        join public.otazky o on o.id = u.id
        join private.otazky_reseni r on r.otazka_id = u.id
        where k.uzivatel_id = v_uzivatel and k.konec is not null
        group by o.kategorie
      ) as x
    ),

    'posledni', (
      select coalesce(jsonb_agg(
               jsonb_build_object('datum', p.konec, 'kategorie', p.kategorie, 'skore', p.skore,
                                  'pocet', p.pocet, 'trvani_s', p.trvani_s)
               order by p.konec desc), '[]'::jsonb)
      from (
        select k.konec, k.kategorie, k.skore, k.pocet,
               round(extract(epoch from k.konec - k.zacatek))::integer as trvani_s
        from public.kola k
        where k.uzivatel_id = v_uzivatel and k.konec is not null
        order by k.konec desc
        limit 10
      ) as p
    )
  );
end;
$$;

revoke all on function public.moje_statistiky() from public, anon, authenticated;
grant execute on function public.moje_statistiky() to authenticated;
