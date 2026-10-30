// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ChatMessage, { ChatMediaView } from "./chat-message";

afterEach(cleanup);

describe("ChatMediaView", () => {
  it("renders a lazy image with alt text and swaps to alt text if it fails", () => {
    render(<ChatMediaView media={{ kind: "gif", url: "https://k/rasode.gif", alt: "rasode mein kaun tha" }} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("chat-media--gif");
    expect(img.alt).toBe("rasode mein kaun tha");
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("[rasode mein kaun tha]")).toBeTruthy();
  });

  it("a media-only friend message hides the [sent a GIF] placeholder", () => {
    render(
      <ChatMessage from="someone" text="[sent a GIF]" isUser={false} media={{ kind: "sticker", url: "https://m/drake.jpg", alt: "Drake meme" }} />,
    );
    expect(screen.queryByText("[sent a GIF]")).toBeNull();
    expect(screen.getByAltText("Drake meme").className).toContain("chat-media--sticker");
  });
});
