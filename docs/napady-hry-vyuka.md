# Nápady: rozdělení webu, minihry, multiplayer

Seznam z debaty 26. 10. 2026 (přepsaný z fotek uživatele). Rozhodnutí se
zapisují do oddílu „Rozhodnuto“ na konci.

## 1. Rozdělení na dvě části

**Výuka / Učebna (učení, bez tlaku):**
- pravidla,
- slovníček,
- trenažér zápisu,
- trenažér postavení,
- kvíz podle kategorií, opakování chyb,
- zkouška.

**Hry / Hala (hraní a soutěžení):**
- denní výzva,
- minihry,
- duely, multiplayer,
- žebříček, odznaky.

Navigace: **Hry · Výuka · Pravidla · Žebříček · Profil** (pořád 5 položek).
Hry a Výuka budou rozcestníky s kartami. Pravidla zůstávají v navigaci
zvlášť, protože se do nich odkazuje odevšad. Gesta se rozdělí: atlas gest
do Výuky, kvíz gest do Her.

## 2. Minihry (využijí to, co už máme)

Máme hotové animace situací, 3D postavu rozhodčího s 27 gesty, 3D hřiště
a model zápisu. Nové hry se dají postavit hlavně z těchto dílů.

1. **„Odpískej to!“** (nápad uživatele). Přehraje se animace situace,
   třeba přešlap při podání. Hráč pak z atlasu gest vybere, co ukáže.
   Těžší verze chce **správné pořadí gest**: nejdřív kdo podává příště,
   pak druh chyby, pak případně hráče, který chybu udělal. Tak to rozhodčí
   opravdu dělá a je to dobrý trénink.
2. **Píšťalka (reakční hra).** Animace běží a hráč klepne ve chvíli, kdy
   se stane chyba (dotyk sítě, dvojí odbití…). Body se dávají za přesnost
   načasování a pak za určení chyby. Každý pokus je krátký a dá se snadno
   hrát znovu.
3. **Rotační sprint.** Družstvo získá podání a hráč na hřišti přetáhne
   hráče na nové pozice. Hraje se na čas a obtížnost roste: střídání,
   libero, chyba v pořadí podání.
4. **Pravda / nepravda na čas.** Za 60 sekund co nejvíc tvrzení
   z pravidel, např. „Libero smí podávat.“ Odpovídá se šipkou
   doleva/doprava nebo tažením karty. Jednoduché na výrobu a návykové.
5. **Najdi chybu v zápisu.** Zápis s jednou chybou (špatné skóre
   u oddechového času, chybějící střídání…), hráč na ni klepne.
   Vykreslování zápisu už máme.
6. **Gesto naopak.** Hra ukáže význam („Míč v autu“) a 4 animace postavy.
   Hráč vybere tu správnou. Je to jen obrácený kvíz gest, takže skoro
   zadarmo.

## 3. Kariéra rozhodčího (spojí obě části)

Postup úrovněmi: krajský přebor → 2. liga → 1. liga → Extraliga →
mezinárodní. Každá úroveň je „zápas“, tedy série úkolů ze všech trenažérů:
situace, gesto, zápis, postavení. Na konci přijde „hodnocení delegáta“
(1–5 hvězd). Na další úroveň se postupuje jen s dostatečným hodnocením
a vyšší úrovně jsou těžší a rychlejší.

Výhody:
- dává webu příběh a důvod se vracet,
- využije všechno, co už existuje,
- hráč přirozeně narazí na části, které by jinak minul (zápis, postavení).

Úplně nahoře by mohl být **celý zápas jako rozhodčí**: animace rozehry →
rozhodnutí → gesto → zápis. To je velká věc, ale byla by to jedinečná
vlastnost webu.

## 4. Multiplayer: tři varianty

Hráčů bude ze začátku málo. Multiplayer, kde se čeká na náhodného soupeře,
by byl většinou prázdný. Začít proto variantami, které na tom nezávisí.

**A) Asynchronní duel.** Hráč odehraje kolo a pošle výzvu kamarádovi
(odkaz nebo přezdívka). Ten hraje stejné otázky, kdy má čas, a pak se
porovná skóre i čas.
- Nepotřebuje, aby byli oba online současně.
- Technicky jednoduché: nová tabulka a dvě nebo tři RPC funkce, skóre dál
  počítá server.
- **Tímhle začít.**

**B) Režim pro školení („Kahoot pro rozhodčí“).** Lektor na kurzu
rozhodčích pustí na projektoru místnost s kódem. Účastníci se připojí
z mobilů a odpovídají na stejnou otázku současně. Po každé otázce se ukáže,
kolik lidí co zvolilo, a lektor vysvětlí. Na konci přijde pořadí.
- Pro cílovou skupinu je to asi **nejcennější varianta**: kurzy rozhodčích
  existují a lektoři by to mohli opravdu používat.
- Hodil by se sem nápad s animací faulu a výběrem gesta. Na velké
  obrazovce to bude fungovat dobře.
- Technicky: Supabase Realtime (je v bezplatném tarifu) pro „lektor
  přepnul otázku“ a „kdo už odpověděl“. Odpovědi a body dál vyhodnocuje
  server, aby se nedalo podvádět. Do CSP by přibylo jen povolení `wss://`
  na naši Supabase adresu.

**C) Živý duel 1 v 1.** Oba vidí stejnou otázku zároveň a rychlejší správná
odpověď dostane víc bodů. Je to nejzábavnější, ale potřebuje soupeře online.
- Řešilo by se to pozvánkou kódem nebo odkazem, ne náhodným hledáním
  soupeře.
- Postaví se na stejném základu jako B, takže by přišel až po něm.

## 5. Výuka: co by šlo přidat

- **Kurz po lekcích.** Mapa kapitol pravidel: přečti kapitolu → krátký
  kvíz jen z ní → hotovo. Postup se ukládá v profilu. Je to přirozená cesta
  pro úplné začátečníky, kteří teď neví, kde začít.
- **Kartičky s opakováním v rozestupech.** Zapomenutá pravidla se vracejí
  častěji, známá méně (Leitnerův systém). Navazuje na současné opakování
  chyb.
- **Trénink podle role.** Zapisovatel, čárový, 2. rozhodčí, 1. rozhodčí:
  každá role má jinou sadu úloh a gest. Kdo se připravuje na zapisovatele,
  nepotřebuje všechno.
- **Co je nového v pravidlech 2025–2028.** Přehled změn proti minulé verzi.
  Zkušení rozhodčí to ocení.
- **„Zeptej se pravidel“ (AI)** je už v plánu. Hodilo by se do Výuky.

## 6. Doporučené pořadí

| # | Co | Velikost | Proč teď |
|---|---|---|---|
| 1 | Rozdělení Výuka / Hry (rozcestníky, navigace) | malé | připraví místo pro všechno další |
| 2 | „Odpískej to!“ + Gesto naopak | střední | silný nápad, využije postavu i animace |
| 3 | Asynchronní duel | střední | první sociální prvek, funguje i s málo hráči |
| 4 | Kariéra rozhodčího | velké | spojí vše a dá důvod se vracet |
| 5 | Režim pro školení | velké | nejcennější pro lektory, Realtime |
| později | Živý duel, kurz po lekcích, kartičky, AI | – | podle zájmu |

Otevřené otázky:
- Duely: soutěžit jen mezi přihlášenými (jednodušší a bezpečnější), nebo
  i anonymně?
- Režim pro školení: zná uživatel lektora, kterému bychom ho mohli ukázat?
  Hodně by pomohlo poznat, co na kurzech opravdu potřebují.

## Rozhodnuto

- 26. 10. 2026: navigace **Hry · Výuka · Pravidla · Žebříček · Profil**
  (názvy Hry/Výuka místo Hala/Učebna).
- Postup: hra po hře podle pokynů uživatele.
