// Capitulation Rider: a cbBTC bot for agent-fun/bars-replay/v1.
//
// Strategy
// --------
// Both published dev windows are grinding downtrends (-4.0% and -4.9% over
// 24h), and every frequent-trading idea tested on them bleeds: 1-minute
// flush scalps, EMA-dip, Bollinger and RSI mean reversion, momentum,
// breakouts and EMA crosses all lose money, because the round-trip cost is
// ~26 bps and the drift is -0.28 bps/min — any position held through the
// grind pays drift plus fees. The one thing that does pay is patience:
// after a deep 60-minute capitulation the price reliably recovers part of
// the fall over the next 1-3 hours, and the recovery's best leg is a single
// +3-4% rally. So this bot trades rarely and only at capitulation, then
// waits for the rally instead of cutting it short.
//
//   Entry (on a bar's close, filled at the next bar's open):
//     - close >= 2.0% below the highest close of the last 60 bars
//       (a 60-bar drawdown of -2% or worse) -> buy 100% of cash.
//       One position at a time; 30 bars of cooldown after any exit, so a
//       single capitulation episode is entered once, not re-bought on
//       every bar the drawdown persists.
//   Exit (the whole position, checked on every bar while holding):
//     - value >= 3.0% above cost (take profit), or
//     - 180 bars after the entry bar (time exit: 3 hours is enough for
//       the recovery leg; holding longer just pays more drift).
//   Deliberately NO stop-loss and NO trailing stop: both were tested and
//   both lose money on the dev windows. The winning rally dips ~-1% below
//   its entry within 6 bars before running +3.4%, so any stop tighter
//   than -1% kills it; and the post-capitulation path is choppy, so a
//   trailing stop fires on noise and exits before the rally. The 180-bar
//   time exit bounds the worst case instead (max drawdown 2.8% on the
//   dev windows, far inside the 25% guardrail).
//   Every order caps slippage at 100 bps (1%) past the close it was
//   decided on.
//
// Dev-window results (published 24h windows, 1,440 bars each, exact-integer
// fill model with the harness's 4 bps fee + 2 bps slippage +
// constant-product price impact):
//   NEW window (2026-11-14 08:29 UTC -> 2026-11-15 08:28 UTC, -4.00%):
//     net PnL +30.198216 USDC (harness grade-local, process driver),
//     4 trades (2 round trips), win rate 0.50, max drawdown 2.8078%,
//     fees 1.61 USDC (net PnL 28.56 USDC even at 2x fees), guardrails met.
//     Trade 1: buy $64,413 -> hold 180 bars -> -$2.99 (flat, time exit).
//     Trade 2: buy $63,187 -> sell $65,342 (+3.4%) -> +$33.19 (the
//     window-end rally; this is the trade the whole design exists for).
//     Passes the dev gate (PnL > 0) and sits close to the perfect-
//     foresight ceiling for this window (+$35.87 with TP 1.0% / SL 0.5% /
//     30-bar holds and knowledge of the future). L1 regrade reproduced
//     the action log byte for byte (deterministic).
//   OLD window (2026-11-12 23:15 UTC -> 2026-11-13 23:15 UTC, -4.91%):
//     net PnL -11.75 USDC, 1 round trip, max drawdown 2.2%.
//     The old window has no post-capitulation rally, so the single trade
//     just bleeds drift for 180 bars. Honest worst case: about -$12 in
//     a rally-less downtrend window.
//
// Determinism
// -----------
// Pure bigint math (the drawdown is tested as close*10000 <= high*9800;
// the exit compares value*1000 against cost*1030). No clock, no
// randomness, no network, no files outside this repository. Two runs on
// the same bars produce byte-identical orders.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a byte-identical
// copy of the kit's sdk/makefun-bars.ts.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** Entry: 60-bar drawdown of -2.0% or worse (bigint math, no floats). */
const LOOKBACK_BARS = 60; // bars before the current one in the window
const DD_NUM = 9800n; // close <= high * 9800 / 10000  ==  drawdown <= -2.0%
const DD_DEN = 10000n;
/** Exit: take profit +3.0%, max hold 180 bars (3 hours). */
const TP_NUM = 1030n;
const TP_DEN = 1000n;
const MAX_HOLD_BARS = 180;
/** Cooldown after any exit before a new entry may fire. */
const COOLDOWN_BARS = 30;
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

/** Rolling window of closes (raw price units), oldest first, at most 61. */
const closes: bigint[] = [];
/** Seq of the bar the buy was decided on, null while flat. */
let entrySeq: number | null = null;
/** Seq of the bar the last exit was decided on (for the cooldown). */
let lastExitSeq: number | null = null;
/** True between emitting a buy and seeing its fill land in the account. */
let expectingFill = false;

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    if (closes.length > LOOKBACK_BARS + 1) closes.shift();

    // Warm-up bars build history only; orders on them are rejected.
    if (state.warmingUp) {
      return [];
    }

    const held = state.positions.get(SYMBOL);
    const orders: (BuyInput | SellInput)[] = [];
    if (held !== undefined) {
      if (entrySeq === null) {
        // Position appeared (fill landed); start the hold clock now.
        entrySeq = state.seq;
      }
      expectingFill = false;
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      if (
        value * TP_DEN >= cost * TP_NUM ||
        state.seq - entrySeq >= MAX_HOLD_BARS
      ) {
        lastExitSeq = state.seq;
        entrySeq = null;
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    } else {
      if (expectingFill) {
        // The buy was rejected (no position appeared); clear the clock.
        expectingFill = false;
        entrySeq = null;
      }
      entrySeq = null;
      if (lastExitSeq !== null && state.seq - lastExitSeq < COOLDOWN_BARS) {
        return [];
      }
      if (closes.length === LOOKBACK_BARS + 1) {
        let high = closes[0];
        for (const c of closes) {
          if (c > high) high = c;
        }
        if (close * DD_DEN <= high * DD_NUM) {
          let amount = state.cash;
          const room = state.weightRoom(SYMBOL);
          if (room < amount) amount = room;
          const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
          if (amount >= minNotional && amount > 0n) {
            entrySeq = state.seq;
            expectingFill = true;
            orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS });
          }
        }
      }
    }
    return orders;
  },
});
