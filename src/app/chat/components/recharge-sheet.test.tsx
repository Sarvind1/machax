// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RechargeSheet from "./recharge-sheet";
import type { CreditSummary } from "@/lib/credits";

const credits: CreditSummary = {
  balanceMicros: 0,
  messagesLeft: 0,
  topupMessages: 13,
  avgCostMicros: 150_000,
};

const noop = () => {};

afterEach(cleanup);

describe("RechargeSheet", () => {
  it("shows the title and price line with the top-up message count", () => {
    render(<RechargeSheet open credits={credits} onClose={noop} onBuy={noop} busy={false} error={null} />);
    expect(screen.getByText("top up")).toBeTruthy();
    expect(screen.getByText("₹219 → about 13 more messages")).toBeTruthy();
  });

  it("calls onBuy when pay is pressed", () => {
    const onBuy = vi.fn();
    render(<RechargeSheet open credits={credits} onClose={noop} onBuy={onBuy} busy={false} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "pay ₹219" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it("disables pay while busy and shows the error", () => {
    const onBuy = vi.fn();
    render(<RechargeSheet open credits={credits} onClose={noop} onBuy={onBuy} busy error="payment failed. try again." />);
    const pay = screen.getByRole("button", { name: /pay/ }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    expect(screen.getByText("payment failed. try again.")).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <RechargeSheet open={false} credits={credits} onClose={noop} onBuy={noop} busy={false} error={null} />,
    );
    expect(container.textContent).toBe("");
  });
});
