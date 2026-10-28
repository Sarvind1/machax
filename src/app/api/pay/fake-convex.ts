import { getFunctionName } from "convex/server";

// In-memory stand-in for the Convex calls the payment routes make, shared by
// the Razorpay and RevenueCat route tests. pay.fulfillOrder / pay.refundOrder
// follow the same rules as convex/pay.ts (which convex/pay.test.ts checks for
// real), so route tests exercise the outcomes, not a script of return values.

export type FakeOrder = {
  uid: string;
  provider: string;
  providerOrderId: string;
  productId: string;
  amountPaise: number;
  creditMicros: number;
  status: "created" | "paid" | "failed" | "refunded";
  createdAt: number;
  paidAt?: number;
};

type Args = Record<string, unknown> & {
  providerOrderId?: string;
  ref?: string;
  amountMicros?: number;
  status?: FakeOrder["status"];
  paidAt?: number;
};

export function fakePayConvex(opts: {
  orders?: FakeOrder[];
  // false: the account was deleted (fulfill/refund answer no_user)
  user?: boolean;
  // starting balance once the credits row exists
  balanceMicros?: number;
  // function name ("pay:fulfillOrder") that throws, as if Convex were down
  fail?: string;
}) {
  const orders = new Map((opts.orders ?? []).map((o) => [o.providerOrderId, { ...o }]));
  const refs = new Set<string>();
  const state = { balanceMicros: opts.balanceMicros ?? 1_000_000, orders };
  const userExists = opts.user !== false;

  const query = async (ref: unknown, args: Args) => {
    const name = getFunctionName(ref as never);
    if (name === opts.fail) throw new Error("convex down");
    if (name === "orders:getByProviderOrderId") {
      const o = orders.get(args.providerOrderId!);
      return o ? { ...o } : null;
    }
    if (name === "credits:get") {
      return { balanceMicros: state.balanceMicros, lifetimeSpentMicros: 0, messageCount: 0 };
    }
    throw new Error(`unexpected query ${name}`);
  };

  const mutation = async (ref: unknown, args: Args) => {
    const name = getFunctionName(ref as never);
    if (name === opts.fail) throw new Error("convex down");
    const id = args.providerOrderId!;
    const order = orders.get(id);
    switch (name) {
      case "orders:create":
        if (!order) {
          orders.set(id, { ...(args as unknown as FakeOrder), status: "created", createdAt: Date.now() });
        }
        return "orderDocId";
      case "orders:setStatus":
        if (!order) throw new Error(`orders: no order ${id}`);
        order.status = args.status!;
        if (args.paidAt !== undefined) order.paidAt = args.paidAt;
        return null;
      case "pay:fulfillOrder": {
        if (!order) return { outcome: "no_order" };
        if (order.status === "refunded") return { outcome: "refunded" };
        if (!userExists) return { outcome: "no_user" };
        const fresh = !refs.has(args.ref!);
        if (fresh) {
          refs.add(args.ref!);
          state.balanceMicros += order.creditMicros;
        }
        if (order.status !== "paid") {
          order.status = "paid";
          order.paidAt = Date.now();
        }
        return { outcome: fresh ? "granted" : "already", balanceMicros: state.balanceMicros };
      }
      case "pay:refundOrder": {
        if (!order) return { outcome: "no_order" };
        const granted = order.status === "paid" || (order.status === "refunded" && order.paidAt !== undefined);
        if (!granted) {
          order.status = "refunded";
          return { outcome: "closed" };
        }
        if (!userExists) return { outcome: "no_user" };
        const fresh = !refs.has(args.ref!);
        if (fresh) {
          refs.add(args.ref!);
          state.balanceMicros += args.amountMicros!;
        }
        order.status = "refunded";
        return { outcome: fresh ? "adjusted" : "already" };
      }
      default:
        throw new Error(`unexpected mutation ${name}`);
    }
  };

  return { query, mutation, state };
}
