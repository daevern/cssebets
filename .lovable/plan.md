# F1 Odds Provider: Research + Wiring Plan

## What I verified live

I queried your existing Odds API key against `/v4/sports?all=true`: it returns **175 sports across 16 groups** — American Football, Aussie Rules, Baseball, Basketball, Boxing, Cricket, Golf, Handball, Ice Hockey, Lacrosse, MMA, Politics, Rugby League/Union, Soccer, Tennis. There is **no motorsport group and no Formula 1 key at all**. So The Odds API cannot serve F1, on any plan.

## Candidates found

| Provider | F1 odds? | Indicative price | Notes |
| --- | --- | --- | --- |
| **SportsGameOdds** | Yes — dedicated Motorsports odds API (race winner, podium/top-N, matchups, props), 85+ books | From **$99/mo**, free tier available | REST/JSON, similar shape to what your UFC/football adapters already consume. Free tier lets us confirm F1 race coverage before paying. |
| BetsAPI (b365api) | Yes — Formula 1 listed with in-play + prematch odds | $150/mo Bet365 package, or $300/mo "Everything" | Single-book (Bet365) feed, older XML-ish conventions, contact-based onboarding for some sports. |
| Goalserve | Odds feed 25+ sports; F1 feed is data-only ($150/mo), odds package $500/mo all-sports | $500/mo | Expensive for one sport; F1 odds coverage needs sales confirmation. |
| OpticOdds | Yes — full motorsport futures (Winner, Top-N, matchups) with documented grading rules | Enterprise (quote) | Best-in-class, but sales-gated and priced for trading desks. |
| RapidAPI "Motor Sport API" | Data only, no odds | $200/mo | Not useful for betting prices. |

## Recommendation

**SportsGameOdds.** It is the only candidate that is self-serve, priced at your current tier (~$99/mo), explicitly covers motorsports odds from many books, and has a free tier we can use to verify real Bahrain-race prices before you spend anything. BetsAPI is the fallback if SGO's F1 depth turns out thin; OpticOdds is the upgrade path if you later want operator-grade futures grading.

## Proposed build (after you pick a provider)

1. **Validate first, pay second** — with a free-tier key, pull the motorsport league list and the next F1 race, and print exactly which markets come back (Race Winner, Podium/Top-N, Winning Constructor, Head-to-Head matchups, Fastest Lap). No code committed until real prices are confirmed.
2. **New adapter** `src/features/f1/services/f1OddsProvider.server.ts` — fetch + normalise provider payloads into your existing `f1_race_markets` / `f1_championship_markets` shape, mapping provider driver names onto your API-F1 driver IDs with a name-alias table for mismatches.
3. **Provenance** — reuse the UFC pattern: write `odds_source` on every row so only bookmaker-backed prices ever publish, and keep the house-model builder deleted.
4. **Lift the suspension gate** — `F1_ODDS_SUSPENDED` in `f1Sync.server.ts` becomes conditional: markets open only when the provider returned prices for that race, otherwise they stay suspended rather than falling back to modelled odds.
5. **Settlement** — grade from API-F1 classified results (position 1 for winner, top-N for podium, DNF/DNS handling per market), independent of the odds provider.
6. **Cron** — fold the F1 odds pull into the existing sync schedule with the same chunked upsert + no-op-skip trigger so the disk-IO budget stays where it is.

## Technical notes

- Provider key stored as a project secret (e.g. `F1_ODDS_API_KEY`), read inside server-function handlers only.
- Driver-name matching is the main integration risk: provider names vs API-F1 driver IDs need a persisted alias map plus an admin view of unmatched names.
- Keep API-F1 as the source of truth for schedule, drivers, constructors, and results; the new provider supplies prices only.
