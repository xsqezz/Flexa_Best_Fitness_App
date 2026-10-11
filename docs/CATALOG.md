# Polski katalog produktów z kodami kreskowymi

150 pozycji w `shared/polish-catalog.ts` to zakres wymagany przez użytkownika,
nie potwierdzony ranking popularności Fitatu. Po 25 pozycji przypada na nabiał,
mięso/ryby, pieczywo/zboża, przekąski, napoje i dodatki.

Rekordy z kodami i wartościami pochodzą z Open Food Facts, nie z bazy Fitatu.
Podstawą jest pełny eksport produktów oznaczonych `en:poland` z oficjalnego
[Open Food Facts Query](https://query.openfoodfacts.org/docs), bez limitu do
kilku tysięcy wyników. Drugi eksport obejmuje rekordy bez tego tagu, ale z
jednoznacznym krajem zakupu: `Polska`, `polska`, `Poland`, `poland`,
`Poland - Polski` lub `poland-polski`. Każdy opublikowany rekord zachowuje
`marketEvidence`: tag kraju sprzedaży albo dokładną źródłową wartość miejsca
zakupu. Sam prefiks `590`, polska nazwa, marka, kraj produkcji lub nazwa
międzynarodowej sieci sklepów nie wystarczają.

Eksport z **11 października 2026** zawiera **32 987 unikalnych produktów z
prawidłowymi kodami GTIN i nazwami**: 32 916 z tagiem Polski i 71 z krajem
zakupu w Polsce. 24 579 produktów ma wartość energetyczną. Pokryte są 148
spośród 150 wymaganych typów; brak potwierdzonych polskich rekordów dla batonów
Barebells/Nutrend i Kinder Country nie jest uzupełniany wariantami zagranicznymi.
Wyszukiwanie tych brakujących produktów nadal może korzystać z bazy online.

Indeks źródła obejmował 38 216 rekordów z obu filtrów. 22 dokumenty były
niedostępne także po sprawdzeniu ich dokładnych kodów. Spośród 38 194 pobranych
dokumentów odrzucono 446 nieprawidłowych kodów i 4 761 rekordów bez nazwy.
Statystyki importu, filtr, data i pochodzenie są zapisane w wynikowym JSON.
Równoważne kody zapisane z wiodącymi zerami nie są liczone jako osobne produkty.
Kod nigdy nie jest dopasowywany do podobnego produktu ani wymyślany dla produktu
ogólnego.

`app/public/data/polish-products.json` jest publicznym eksportem adaptowanej
bazy na **ODbL 1.0**, z atrybucją **Open Food Facts contributors**, źródłem
i datą pobrania w samym pliku. Warunki:
https://opendatacommons.org/licenses/odbl/1-0/
Nie pobieramy zdjęć. Źródłowa baza pozostaje społecznościowa, niepełna
i nie jest certyfikowanym źródłem medycznym. Oznaczenie sprzedaży lub zakupu
w Polsce nie jest gwarancją aktualnego stanu magazynowego sklepów.

Aktualizacja (Node 24, po `npm ci`, z katalogu głównego repozytorium):

```powershell
node scripts\fetch-polish-catalog.mjs C:\path\to\official-export.json
node scripts\import-polish-catalog.mjs C:\path\to\official-export.json
```

Pierwszy skrypt pobiera wszystkie rekordy z obu filtrów oraz sprawdza pełność
indeksu. Dokumenty brakujące w odpowiedzi zbiorczej sprawdza ponownie po kodach;
ich niedostępność raportuje jawnie i zapisuje listę w eksporcie źródłowym.
Błędy HTTP, nieprawidłowe odpowiedzi i zmiany indeksu przerywają pobieranie,
zamiast publikować częściowy zestaw. Zachowaj eksport źródłowy do audytu.

Importer raportuje oddzielnie pokrycie 150 pozycji, liczbę prawdziwych kodów
i liczbę rekordów z energią oraz powody odrzucenia danych. Odrzuca rekordy
bez dowodu polskiego rynku, także w starszych eksportach z zagranicznymi
uzupełnieniami. Oba skrypty podmieniają plik dopiero po zapisaniu pełnego
wyniku do pliku tymczasowego. Nieznanych wartości importer nie zastępuje zerem.
Obsługiwane są starsze `nutriments` i nowa struktura `nutrition.aggregated_set`.
Do zestawu per 100 g / 100 ml nie trafiają wartości per porcję lub po
przygotowaniu. Wartości źródłowo szacunkowe są oznaczone.

Katalog nie obiecuje wszystkich opakowań i smaków danej marki. Rekord bez
energii można rozpoznać, ale przed wpisem do dziennika trzeba uzupełnić etykietę.
Produkty spoza katalogu nadal korzystają z zapytania online. Własne produkty
użytkownika mają pierwszeństwo i nie są publikowane.

Sprawdzono również [Datakick](https://gtinsearch.org/download) (6 561 rekordów,
CC0) oraz [OpenNutrition](https://www.opennutrition.app/download) (326 759
rekordów, z czego 313 442 z polem kodu). Ich eksporty nie mają pola kraju
sprzedaży; w rekordach z kodami OpenNutrition nie znaleziono też źródłowych
adresów domen `.pl`. Nie dodano ich bez potwierdzenia polskiego rynku.
[Brocade](https://github.com/EventideSystems/brocade.io) bazuje na eksporcie
Datakick, więc nie daje niezależnego potwierdzenia. Liczba rekordów w dużej
międzynarodowej bazie nie jest liczbą produktów dostępnych w Polsce.
