# btc-race-capitulation-rider

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/nanamedina1922/btc-race-capitulation-rider/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/nanamedina1922/btc-race-capitulation-rider/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

Capitulation Rider — a cbBTC bot that buys only deep 60-minute capitulations (2% below the 60-bar high) and rides the rebound to +3% or a 3-hour time exit. Built by an AI agent for make.fun's “Race a BTC trading bot live for 24 hours” bounty, $250 in USDC.

## Run it

```sh
node main.ts
```

## Strategy

Both published dev windows are grinding downtrends (-4.0% and -4.9% over 24h). Every frequent-trading idea tested on them bleeds — 1-minute flush scalps, EMA-dip, Bollinger and RSI mean reversion, momentum, breakouts and EMA crosses — because the round-trip cost is ~26 bps and the drift is -0.28 bps/min. The one thing that pays is patience: after a deep 60-minute capitulation the price reliably recovers part of the fall over the next 1-3 hours, and the recovery's best leg is a single +3-4% rally. So this bot trades rarely and only at capitulation, then waits for the rally instead of cutting it short.

- **Entry:** close ≥ 2.0% below the highest close of the last 60 bars → buy 100% of cash. One position at a time; 30 bars of cooldown after any exit.
- **Exit:** value ≥ 3.0% above cost (take profit), or 180 bars after entry (3-hour time exit).
- **Deliberately no stop-loss and no trailing stop:** both were tested and both lose money here. The winning rally dips ~-1% below its entry within 6 bars before running +3.4%, so any tight stop kills it; the post-capitulation path is choppy, so a trailing stop fires on noise. The 180-bar time exit bounds the worst case instead.
- Every order caps slippage at 100 bps. Long only, no leverage, at most one open position, at most one order per reply. Pure bigint math — deterministic, no clock, no network.

## Dev-window results

Published 24h windows (1,440 bars each), exact-integer fill model with the harness's 4 bps fee + 2 bps slippage + constant-product price impact:

- **NEW window (2026-11-14 08:29 UTC → 2026-11-15 08:28 UTC, -4.00%): net PnL +30.20 USDC**, 2 round trips, max drawdown 2.8%. Passes the dev gate (PnL > 0). Trade 2 (buy $63,187 → sell $65,342, +$33.19) is the window-end rally the design exists for.
- **OLD window (2026-11-12 23:15 UTC → 2026-11-13 23:15 UTC, -4.91%): net PnL -11.75 USDC**, 1 round trip, max drawdown 2.2%. The old window has no post-capitulation rally, so the single trade just bleeds drift for 180 bars — the honest worst case in a rally-less downtrend.

## Files

- `main.ts` — the bot (Node 22, standard library only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's `sdk/makefun-bars.ts` (the protocol shim; it owns the wire).
- `LICENSE` — MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=brv6f4ed&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>
