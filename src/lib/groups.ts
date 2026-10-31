// groups.ts — the six friend groups the home screen picks from, a keyword
// picker that guesses one from the question, and the pod for each group.

import { selectPod } from "./friends";

export type GroupKey = "advice" | "late" | "honest" | "family" | "work" | "money";

export interface Group {
  key: GroupKey;
  name: string;
  blurb: string;
  tags: string[];
}

export const GROUPS: Group[] = [
  { key: "advice", name: "the advice crew", blurb: "for anything, really", tags: ["life"] },
  { key: "late", name: "late night talks", blurb: "exes, crushes, 2am thoughts", tags: ["feelings", "relationship"] },
  { key: "honest", name: "the honest friends", blurb: "they won't sugarcoat it", tags: ["hot-takes"] },
  { key: "family", name: "family matters", blurb: "parents, rishtas, siblings", tags: ["life", "relationship"] },
  { key: "work", name: "work stuff", blurb: "bosses, jobs, hikes", tags: ["career"] },
  { key: "money", name: "money talk", blurb: "loans, rent, big buys", tags: ["money", "what-to-buy"] },
];

export const GROUPS_BY_KEY: Record<GroupKey, Group> = Object.fromEntries(
  GROUPS.map((g) => [g.key, g]),
) as Record<GroupKey, Group>;

// First match wins, so order matters: "boss owes me 15k" is money talk.
const RULES: [GroupKey, RegExp][] = [
  ["money", /(\d+\s?k\b|₹|\brupees?\b|\bmoney\b|\brent\b|\bloan|\bowes?\b|\bsalary|\bsavings?\b|\bemi\b|\bbudget|\bafford|\blakhs?\b)/],
  ["work", /(\bboss|\bjob\b|\bjobs\b|\boffice|\bmanager|\bwork|\bintern|\bresign|\bquit|\bhike\b)/],
  ["family", /(\bmom\b|\bmum\b|\bdad\b|\bpapa\b|\bmummy\b|\bparents?\b|\bfamily|\brishta|\bshaadi|\bsister|\bbrother|\bcousin)/],
  ["late", /(\bex\b|\bcrush|\b2\s?am\b|\bstory\b|\bdm\b|\bdates?\b|\bdating\b|\bghost|\bbreak\s?up)/],
  ["honest", /(\broommate|\bflatmate|\bignored|\binvite|\blied\b|\bhonest|\bfight)/],
];

// Guess the group from the question. Anything unmatched goes to the advice crew.
export function pickGroup(text: string): GroupKey {
  const t = (text || "").toLowerCase();
  for (const [key, re] of RULES) {
    if (re.test(t)) return key;
  }
  return "advice";
}

// Friend ids for a group, picked by the group's tags.
export function podForGroup(key: GroupKey, size: number): string[] {
  const group = GROUPS_BY_KEY[key] ?? GROUPS_BY_KEY.advice;
  return selectPod(group.tags, size).map((f) => f.id);
}

// Short balance for the header: "12 left".
export function compactCreditLabel(n: number): string {
  return `${Math.max(0, Math.floor(n))} left`;
}
