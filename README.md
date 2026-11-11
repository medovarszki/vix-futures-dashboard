# VIX Futures Dashboard

Dashboard a VIX határidős görbe meredekségének kereskedéséhez: élő görbe, lejáratonkénti árjegyzés és likviditás,
calendar spreadek a ténylegesen elérhető bid/ask árak alapján, és a görbe történeti alakja.

Jelenleg csak a felület készült el, **mockolt adatokkal**. Az adatokat később az
[IBKR Facade](https://github.com/medovarszki/ibkrfacade) szolgáltatja.

## Indítás

```bash
npm install
```

```bash
npm run dev
```

További parancsok: `npm test` (számítások tesztjei), `npm run build` (típusellenőrzés és éles build).

## Mi van a felületen

- **Határidős görbe**: élő mid árak bid–ask sávval a lejáratig hátralévő napok függvényében, előző elszámolóár,
  VIX spot, a szomszédos lejáratok spreadje (mid, contango, vehető / eladható), forgalom, nyitott kötésállomány,
  a jegyzés szélessége tickben.
- **Spread kalkulátor**: két tetszőleges lejárat spreadje – mennyibe kerül a calendar egyben (tőzsdei spread
  könyv), mennyibe lábanként kötve, és mekkora a különbség.
- **Árjegyzés és likviditás** fül: lejáratonkénti táblázat.
- **Calendar spreadek** fül: az összes lejáratpár mátrixa (végrehajtható / mid / last), a kiválasztott pár részletei.
- **Történeti görbe** fül: korábbi napok elszámolóár-görbéi az élő görbére rajzolva, az M1–M2 contango idősora.

## Felépítés

| Hely | Tartalom |
|---|---|
| `src/api/types.ts` | Adatszerződések. A `ContractDto`, `MarketPrice` és `SpreadQuote` az IBKR Facade JSON válaszait követi (`GET /futures/chain`, `GET /prices`, `GET /spread`). |
| `src/api/mock.ts` | Mock adatszolgáltató véletlen bolyongással. Minden érték kitalált. |
| `src/api/index.ts` | Az egyetlen hely, ahol eldől, honnan jön az adat: a facade kliensét itt kell majd bekötni. |
| `src/domain/` | Számítások: lejárati naptár, görbe sorai, spread a lábakból, a lábankénti kötés többletköltsége. |
| `src/components/` | A felület részei. |

A facade nem tárol történeti adatot, ezért a napi görbe-pillanatképeket (`CurveSnapshot`) a dashboard saját
háttere fogja gyűjteni és tárolni; ez még nincs meg.
