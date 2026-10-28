// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CreditPill from "./credit-pill";
import type { CreditSummary } from "@/lib/credits";

const summary = (messagesLeft: number): CreditSummary => ({
  balanceMicros: messagesLeft * 150_000,
  messagesLeft,
  topupMessages: 13,
  avgCostMicros: 150_000,
});

afterEach(cleanup);

describe("CreditPill", () => {
  it("shows ~N messages left for two or more", () => {
    render(<CreditPill credits={summary(12)} onClick={() => {}} />);
    expect(screen.getByRole("button").textContent).toBe("~12 messages left");
  });

  it("shows ~2 messages left at exactly two", () => {
    render(<CreditPill credits={summary(2)} onClick={() => {}} />);
    expect(screen.getByRole("button").textContent).toBe("~2 messages left");
  });

  it("shows last message at one", () => {
    render(<CreditPill credits={summary(1)} onClick={() => {}} />);
    expect(screen.getByRole("button").textContent).toBe("last message");
  });

  it("shows out of messages at zero", () => {
    render(<CreditPill credits={summary(0)} onClick={() => {}} />);
    expect(screen.getByRole("button").textContent).toBe("out of messages");
  });

  it("renders nothing before credits load", () => {
    const { container } = render(<CreditPill credits={null} onClick={() => {}} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(<CreditPill credits={summary(5)} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
