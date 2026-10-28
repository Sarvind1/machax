// pricing.ts — Anthropic token pricing in integer micro-dollars (1,000,000 = $1.00)
//
// Rates are stored as hundredths of a micro-dollar per token ("centi-micros").
// Cache rates are fractional in micro-dollars (Sonnet cache-read = 0.2/token),
// and summing floats such as 30 * 0.1 gives 3.0000000000000004, which would
// round up to the wrong whole micro-dollar. Integer centi-micros keep every
// intermediate value exact; only the final division rounds (up).

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

type Rates = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

const CENTI = 100;

// $ per million tokens == micro-dollars per token. Value here = that * 100.
const SONNET_5_5: Rates = { input: 200, output: 1000, cacheWrite: 250, cacheRead: 20 };
const HAIKU_4_5: Rates = { input: 100, output: 500, cacheWrite: 125, cacheRead: 10 };

// Matched by prefix so dated ids (claude-haiku-4-5-20251001) resolve.
const RATES_BY_PREFIX: ReadonlyArray<readonly [string, Rates]> = [
  ["claude-sonnet-5-5", SONNET_5_5],
  ["claude-haiku-4-5", HAIKU_4_5],
];

function ratesFor(model: string): Rates {
  for (const [prefix, rates] of RATES_BY_PREFIX) {
    if (model.startsWith(prefix)) return rates;
  }
  return SONNET_5_5; // unknown model: bill at the higher (Sonnet) rate
}

/** Cost of one model call in whole micro-dollars, rounded up. */
export function costMicros(model: string, usage: Usage): number {
  const r = ratesFor(model);
  const centi =
    usage.input_tokens * r.input +
    usage.output_tokens * r.output +
    (usage.cache_creation_input_tokens ?? 0) * r.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * r.cacheRead;
  return Math.ceil(centi / CENTI);
}

/** Convert a USD amount to whole micro-dollars. */
export function usdToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}
