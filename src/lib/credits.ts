// Pure credit math. All money is integer micro-dollars: 1_000_000 = $1.00.
export const TOPUP_MICROS = 2_000_000;
export const TOPUP_PAISE = 21_900;
export const TOPUP_PRODUCT_ID = "topup_219";

const FALLBACK_MESSAGE_COST_MICROS = 150_000;
// Own average is trusted only after this many charged messages.
const MIN_MESSAGES_FOR_OWN_AVERAGE = 3;

export function defaultMessageCostMicros(): number {
  const n = Number(process.env.DEFAULT_MESSAGE_COST_MICROS);
  return Number.isInteger(n) && n > 0 ? n : FALLBACK_MESSAGE_COST_MICROS;
}

export function avgCostMicros(s: { lifetimeSpentMicros: number; messageCount: number }): number {
  if (s.messageCount >= MIN_MESSAGES_FOR_OWN_AVERAGE) {
    const avg = Math.round(s.lifetimeSpentMicros / s.messageCount);
    if (avg > 0) return avg;
  }
  return defaultMessageCostMicros();
}

export function messagesLeft(balanceMicros: number, avg: number): number {
  return Math.max(0, Math.floor(balanceMicros / avg));
}

export type CreditSummary = {
  balanceMicros: number;
  messagesLeft: number;
  topupMessages: number;
  avgCostMicros: number;
};

export function summarize(s: {
  balanceMicros: number;
  lifetimeSpentMicros: number;
  messageCount: number;
}): CreditSummary {
  const avg = avgCostMicros(s);
  return {
    balanceMicros: s.balanceMicros,
    messagesLeft: messagesLeft(s.balanceMicros, avg),
    topupMessages: Math.floor(TOPUP_MICROS / avg),
    avgCostMicros: avg,
  };
}
