# VIX Futures Dashboard

Dashboard a VIX határidős görbe meredekségének kereskedéséhez: élő görbe, lejáratonkénti árjegyzés és likviditás,
calendar spreadek a ténylegesen elérhető bid/ask árak alapján, és a görbe történeti alakja.

Az adatokat az [IBKR Facade](https://github.com/medovarszki/ibkrfacade) szolgáltatja, vagy – beállítás nélkül –
egy beépített mock, kitalált értékekkel.

## Indítás

```bash
npm install
```

```bash
npm run dev
```

További parancsok: `npm test` (tesztek), `npm run build` (típusellenőrzés és éles build).

## Bekötés az IBKR Facade-ra

1. A facade legyen elérhető a gépen. A facade Docker Compose stackje alapból semmit nem tesz ki a hostra; a
   `docker-compose.expose.yml` a `127.0.0.1:8082` címre publikálja a REST API-t.
2. Másold a `.env.example` fájlt `.env.local` néven, és állítsd be:
   - `VITE_DATA_SOURCE=facade`
   - `FACADE_URL` – a facade címe (alapból `http://localhost:8082`)
   - `FACADE_TOKEN` – a facade **olvasási** tokenje (`IBKR_SECURITY_READ_TOKEN`), ha a token alapú hitelesítés be
     van kapcsolva. Az írási tokent soha ne add meg itt.
3. Indítsd újra az `npm run dev` parancsot. A fejlécben a „Mintaadat” jelzés helyett „IBKR” látszik.

A böngésző a `/ibkr` útvonalat hívja, amit a fejlesztői szerver továbbít a facade-nak, és ő teszi rá a tokent –
a token így nem kerül a böngészőbe. Ez az `npm run dev` és az `npm run preview` alatt működik; éles kiszolgáláshoz
ugyanilyen `/ibkr` reverse proxy kell.

Amit a facade-tól használ: `GET /futures/chain` (havi VX lejáratok), `GET /prices` (másodpercenként),
`GET /spread` (a kalkulátorban kiválasztott pár), `GET /history/{conid}` (történeti görbe, napon belüli spread).

Tudnivalók:

- A történeti görbék az élő és a lejárt kontraktok napi záróáraiból állnak össze, oldalbetöltésenként egyszer,
  kontraktonként egy lekérdezéssel – az első megnyitás ezért lassú lehet. A napi záróár nem feltétlenül egyezik
  a hivatalos elszámolóárral.
- A facade nem tárol történeti adatot. A napi görbe-pillanatképek saját tárolása még nincs meg; addig minden
  betöltéskor a facade-on keresztül az IBKR-től jön a történet.
- Ha egy lejáratnak nincs friss bid/ask jegyzése, vagy a tőzsdei spread könyvre nincs jegyzés, a felület ezt
  jelzi, és a hiányzó értékek helyén „–” áll.

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
| `src/api/facade.ts` | Az IBKR Facade kliense; a történeti görbéket is ez rakja össze. |
| `src/api/mock.ts` | Mock adatszolgáltató véletlen bolyongással. Minden érték kitalált. |
| `src/api/index.ts` | Itt dől el a `VITE_DATA_SOURCE` alapján, honnan jön az adat. |
| `src/domain/` | Számítások: lejárati naptár, görbe sorai, spread a lábakból, a lábankénti kötés többletköltsége. |
| `src/components/` | A felület részei. |
