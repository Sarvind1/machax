// cost-collector.ts — accumulates model-call costs for one user request.
// One user message fans out to several model calls; each call reports here.

import { costMicros, usdToMicros, type Usage } from "./pricing";

export type ModelCallRecord = {
  model: string;
  usage?: Usage;
  costMicros: number;
  source: "anthropic" | "bridge" | "cli" | "gemini";
};

type ModelTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicros: number;
};

export class CostCollector {
  private readonly records: ModelCallRecord[] = [];

  add(record: ModelCallRecord): void {
    this.records.push(record);
  }

  addAnthropic(model: string, usage: Usage): void {
    this.add({ model, usage, costMicros: costMicros(model, usage), source: "anthropic" });
  }

  /** Bridge calls report cost in USD; a missing figure counts as 0 with a warning. */
  addBridge(costUsd: number | undefined): void {
    if (costUsd === undefined || !Number.isFinite(costUsd)) {
      console.warn("[cost-collector] bridge call reported no cost; counting 0");
      this.add({ model: "bridge", costMicros: 0, source: "bridge" });
      return;
    }
    this.add({ model: "bridge", costMicros: usdToMicros(costUsd), source: "bridge" });
  }

  get totalMicros(): number {
    return this.records.reduce((sum, r) => sum + r.costMicros, 0);
  }

  get calls(): readonly ModelCallRecord[] {
    return [...this.records];
  }

  /** JSON summary for logging: { calls, byModel: { model: token + cost totals } }. */
  toMeta(): string {
    const byModel: Record<string, ModelTotals> = {};
    for (const r of this.records) {
      const t = (byModel[r.model] ??= {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costMicros: 0,
      });
      t.input += r.usage?.input_tokens ?? 0;
      t.output += r.usage?.output_tokens ?? 0;
      t.cacheRead += r.usage?.cache_read_input_tokens ?? 0;
      t.cacheWrite += r.usage?.cache_creation_input_tokens ?? 0;
      t.costMicros += r.costMicros;
    }
    return JSON.stringify({ calls: this.records.length, byModel });
  }
}
