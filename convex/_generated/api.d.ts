/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chatLog from "../chatLog.js";
import type * as conversations from "../conversations.js";
import type * as credits from "../credits.js";
import type * as decisions from "../decisions.js";
import type * as evals from "../evals.js";
import type * as guestLimits from "../guestLimits.js";
import type * as guests from "../guests.js";
import type * as http from "../http.js";
import type * as lib_passwords from "../lib/passwords.js";
import type * as messages from "../messages.js";
import type * as metaCapi from "../metaCapi.js";
import type * as orders from "../orders.js";
import type * as pay from "../pay.js";
import type * as reports from "../reports.js";
import type * as settings from "../settings.js";
import type * as traces from "../traces.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chatLog: typeof chatLog;
  conversations: typeof conversations;
  credits: typeof credits;
  decisions: typeof decisions;
  evals: typeof evals;
  guestLimits: typeof guestLimits;
  guests: typeof guests;
  http: typeof http;
  "lib/passwords": typeof lib_passwords;
  messages: typeof messages;
  metaCapi: typeof metaCapi;
  orders: typeof orders;
  pay: typeof pay;
  reports: typeof reports;
  settings: typeof settings;
  traces: typeof traces;
  users: typeof users;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
