import { describe, it, expect } from "vitest";
import { parseAdminUids } from "./admin-uids";

describe("parseAdminUids", () => {
  it("treats an unset var as nobody", () => {
    expect(parseAdminUids(undefined)).toEqual([]);
  });

  it("treats an empty var as nobody", () => {
    expect(parseAdminUids("")).toEqual([]);
  });

  it("trims entries and drops empty ones", () => {
    expect(parseAdminUids(" a , ,b ")).toEqual(["a", "b"]);
  });

  it("splits a plain list", () => {
    expect(parseAdminUids("a,b")).toEqual(["a", "b"]);
  });
});
