import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

// Friend color data (subset of friends.ts for image rendering)
const FRIEND_COLORS: Record<
  string,
  { name: string; color: string; tintBg: string; tintInk: string }
> = {
  reeva: { name: "Reeva", color: "#6BAE7E", tintBg: "#DCEBD8", tintInk: "#2D5438" },
  aarushi: { name: "Aarushi", color: "#D28AA8", tintBg: "#F4DCE5", tintInk: "#7A3855" },
  priya: { name: "Priya", color: "#5FA6B8", tintBg: "#CFE3E9", tintInk: "#204751" },
  tanmay: { name: "Tanmay", color: "#7A8BD4", tintBg: "#DDE1F3", tintInk: "#2E3B78" },
  arjun: { name: "Arjun", color: "#E2A34A", tintBg: "#F5E3C2", tintInk: "#7A4F14" },
  mira: { name: "Mira", color: "#C87560", tintBg: "#EFD4C9", tintInk: "#6E2F1F" },
  sid: { name: "Sid", color: "#9B7BB8", tintBg: "#E3D6ED", tintInk: "#4A2D66" },
  kavya: { name: "Kavya", color: "#4A9E8F", tintBg: "#D0EAE4", tintInk: "#1D4A40" },
  rohan: { name: "Rohan", color: "#D4854A", tintBg: "#F2DCC8", tintInk: "#6B3711" },
  zara: { name: "Zara", color: "#8B6DB5", tintBg: "#DFD4ED", tintInk: "#3F2460" },
  neha: { name: "Neha", color: "#C4A14A", tintBg: "#F0E6C6", tintInk: "#6B5511" },
  dev: { name: "Dev", color: "#5B8FD4", tintBg: "#D2E2F4", tintInk: "#1E3B6E" },
  meera: { name: "Meera", color: "#D46B8B", tintBg: "#F2D2DD", tintInk: "#6E1E3B" },
};

interface Message {
  from: string;
  text: string;
  isUser: boolean;
}

// Load font from Google Fonts
async function loadFont(family: string, weight: number): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&display=swap`;
  const css = await fetch(url).then((r) => r.text());
  const match = css.match(/src: url\((.+?)\) format/);
  if (!match) throw new Error(`Font not found: ${family}`);
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages: Message[];
      title?: string;
      page?: number;          // 0-indexed page number (old mode)
      pageSize?: number;      // messages per page (old mode, default 5)
      isFirstPage?: boolean;  // explicit override
      isLastPage?: boolean;   // explicit override
    };
    const { messages, title } = body;

    if (!messages?.length) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    // Support two modes:
    // 1. Pre-sliced: caller sends the exact messages for this page + isFirstPage/isLastPage
    // 2. Auto-paginate: caller sends all messages + page index
    let pageMessages: Message[];
    let isFirstPage: boolean;
    let isLastPage: boolean;

    if (body.page != null && body.page >= 0) {
      // Auto-paginate mode
      const perPage = body.pageSize ?? 5;
      pageMessages = messages.slice(body.page * perPage, (body.page + 1) * perPage);
      const totalPages = Math.ceil(messages.length / perPage);
      isFirstPage = body.page === 0;
      isLastPage = body.page >= totalPages - 1;
    } else if (body.isFirstPage != null) {
      // Pre-sliced mode
      pageMessages = messages;
      isFirstPage = body.isFirstPage;
      isLastPage = body.isLastPage ?? false;
    } else {
      // Legacy: render all messages in one image
      pageMessages = messages;
      isFirstPage = true;
      isLastPage = true;
    }

    // Load fonts
    const [bodyFont, bodyFontBold, monoFont] = await Promise.all([
      loadFont("Space Grotesk", 400),
      loadFont("Space Grotesk", 700),
      loadFont("JetBrains Mono", 500),
    ]);

    // Mobile-friendly: 390px wide (iPhone), fixed height for pages
    const width = 390;
    const isPaginated = !isFirstPage || !isLastPage; // multi-page mode
    const height = isPaginated ? 690 : Math.max(500, pageMessages.length * 80 + 200);

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            backgroundColor: "#F4F1E8",
            padding: isFirstPage ? "32px 20px 20px" : "20px 20px 20px",
            fontFamily: "Space Grotesk",
          }}
        >
          {/* Header — only on first page */}
          {isFirstPage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "20px",
                gap: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "#1E1C16",
                  letterSpacing: "-0.5px",
                }}
              >
                Macha
              </span>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  fontStyle: "italic",
                  color: "#3E7A50",
                  letterSpacing: "-0.5px",
                }}
              >
                X
              </span>
              {title && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "JetBrains Mono",
                    fontSize: "10px",
                    color: "#8A8374",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {title}
                </span>
              )}
            </div>
          )}

          {/* Page indicator for continuation pages */}
          {!isFirstPage && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <span
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: "9px",
                  color: "#8A8374",
                  letterSpacing: "0.1em",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(30,28,22,0.12)",
                }}
              >
                continued...
              </span>
            </div>
          )}

          {/* Messages */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              flex: 1,
            }}
          >
            {pageMessages.map((msg, i) => {
              if (msg.isUser) {
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: "#1E1C16",
                        color: "#F4F1E8",
                        padding: "10px 14px",
                        borderRadius: "16px",
                        borderBottomRightRadius: "4px",
                        fontSize: "14px",
                        lineHeight: 1.5,
                        maxWidth: "75%",
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              }

              const friend = FRIEND_COLORS[msg.from];
              const name = friend?.name ?? msg.from;
              const color = friend?.color ?? "#888";
              const tintBg = friend?.tintBg ?? "#eee";
              const tintInk = friend?.tintInk ?? "#333";

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "8px",
                    maxWidth: "80%",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: "18px",
                    }}
                  >
                    {name[0]}
                  </div>
                  {/* Bubble */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "JetBrains Mono",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                        color: tintInk,
                        paddingLeft: "2px",
                      }}
                    >
                      {name.toLowerCase()}
                    </span>
                    <div
                      style={{
                        backgroundColor: tintBg,
                        color: tintInk,
                        padding: "10px 14px",
                        borderRadius: "16px",
                        borderTopLeftRadius: "4px",
                        fontSize: "14px",
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer — branding on last page, page dots on others */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginTop: "auto",
              paddingTop: "16px",
              gap: "8px",
            }}
          >
            {isLastPage ? (
              <span
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: "10px",
                  color: "#8A8374",
                  letterSpacing: "0.1em",
                }}
              >
                machax.xyz — your council of chaos
              </span>
            ) : (
              <span
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: "9px",
                  color: "#8A8374",
                  letterSpacing: "0.08em",
                }}
              >
                swipe →
              </span>
            )}
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: [
          { name: "Space Grotesk", data: bodyFont, weight: 400 },
          { name: "Space Grotesk", data: bodyFontBold, weight: 700 },
          { name: "JetBrains Mono", data: monoFont, weight: 500 },
        ],
      }
    );
  } catch (err) {
    console.error("Content image error:", err);
    return Response.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
