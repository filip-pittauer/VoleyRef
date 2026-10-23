-- =====================================================================
-- 03_statistiky.sql – statistiky přihlášeného hráče
-- Spusť po 01 a 02. Jde spustit i opakovaně (create or replace).
-- Nemění tabulky, jen přidává jednu funkci.
-- =====================================================================

-- ---------------------------------------------------------------------
-- moje_statistiky() → {
--   souhrn:    { kol, otazek, spravne, nejlepsi_skore, nejlepsi_pocet, cas_s },
--   kategorie: [{ kategorie, otazek, spravne }],
--   nejlepsi:  { skore, pocet, trvani_s }                       (nejlepší běžné kolo)
--   posledni:  [{ datum, kategorie, obtiznost, rezim, skore, pocet, trvani_s }]   (posledních 10 kol)
--   zkousky:   { pocet, splnenych, posledni: [{ datum, skore, pocet, trvani_s, splneno }] }  (10 posledních)
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
    -- (jen běžná kola – opakování 2 chyb za 2/2 by jinak bylo „100 %“)
    'nejlepsi', (
      select jsonb_build_object('skore', k.skore, 'pocet', k.pocet,
               'trvani_s', round(extract(epoch from k.konec - k.zacatek))::integer)
      from public.kola k
      where k.uzivatel_id = v_uzivatel and k.konec is not null and k.rezim = 'bezne'
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
               jsonb_build_object('datum', p.konec, 'kategorie', p.kategorie, 'obtiznost', p.obtiznost,
                                  'rezim', p.rezim, 'skore', p.skore, 'pocet', p.pocet, 'trvani_s', p.trvani_s)
               order by p.konec desc), '[]'::jsonb)
      from (
        select k.konec, k.kategorie, k.obtiznost, k.rezim, k.skore, k.pocet,
               round(extract(epoch from k.konec - k.zacatek))::integer as trvani_s
        from public.kola k
        where k.uzivatel_id = v_uzivatel and k.konec is not null
        order by k.konec desc
        limit 10
      ) as p
    ),

    -- zkoušky: kolik jich hráč dělal, kolik splnil a posledních 10
    -- (filter = jen některé řádky do agregace, jako Where() před Select() v LINQ)
    'zkousky', (
      select jsonb_build_object(
        'pocet', count(*),
        'splnenych', count(*) filter (where z.splneno),
        'posledni', coalesce(
          jsonb_agg(jsonb_build_object('datum', z.konec, 'skore', z.skore, 'pocet', z.pocet,
                                       'trvani_s', z.trvani_s, 'splneno', z.splneno)
                    order by z.konec desc) filter (where z.poradi <= 10),
          '[]'::jsonb))
      from (
        select k.konec, k.skore, k.pocet,
               round(extract(epoch from k.konec - k.zacatek))::integer as trvani_s,
               private.zkouska_splnena(k.skore, k.pocet, k.konec - k.zacatek) as splneno,
               row_number() over (order by k.konec desc) as poradi
        from public.kola k
        where k.uzivatel_id = v_uzivatel and k.konec is not null and k.rezim = 'zkouska'
      ) as z
    )
  );
end;
$$;

revoke all on function public.moje_statistiky() from public, anon, authenticated;
grant execute on function public.moje_statistiky() to authenticated;
