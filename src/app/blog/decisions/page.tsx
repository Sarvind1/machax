import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Decision You're Avoiding Is Costing You More Than the Wrong Choice — MachaX",
  description:
    "Not deciding is itself a decision — and usually the worst one. How externalizing the debate gets you unstuck in 20 minutes.",
};

const LogoCup = () => (
  <svg
    className="logo-cup"
    viewBox="0 0 52 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 8 L4 52 Q4 60 12 60 L32 60 Q40 60 40 52 L38 8 Z"
      fill="var(--accent)"
      rx="4"
    />
    <path
      d="M38 18 Q50 18 50 32 Q50 44 40 44"
      stroke="var(--accent)"
      strokeWidth="4"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M14 4 Q16 0 18 4"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M22 2 Q24 -2 26 2"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M30 4 Q32 0 34 4"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
    />
    <text
      x="21"
      y="44"
      textAnchor="middle"
      fill="#fff"
      fontWeight="800"
      fontSize="32"
      fontFamily="sans-serif"
    >
      X
    </text>
  </svg>
);

export default function DecisionsPost() {
  return (
    <>
      {/* NAV */}
      <div className="wrap">
        <div className="topbar">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Macha
              <LogoCup />
            </div>
          </Link>
          <div className="pills">
            <span>blog</span>
          </div>
        </div>
      </div>

      {/* ARTICLE */}
      <article className="wrap" style={{ maxWidth: 720, paddingBottom: 64 }}>
        <p
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 12,
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 8,
          }}
        >
          Apr 2026
        </p>

        <h1
          style={{
            fontFamily: "var(--font-serif), serif",
            fontWeight: 700,
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: 1.05,
            letterSpacing: -1.5,
            margin: "0 0 32px",
          }}
        >
          The Decision You&rsquo;re Avoiding Is Costing You More Than the Wrong Choice
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            You&rsquo;ve been sitting on that decision for weeks now. Maybe months.
            You tell yourself you&rsquo;re &ldquo;thinking it through.&rdquo; Being
            responsible. Weighing the options. But let&rsquo;s be honest&mdash;you&rsquo;re
            just stuck.
          </p>

          <p>
            And here&rsquo;s the thing nobody tells you: not deciding is itself a
            decision. It&rsquo;s a vote for the status quo. A vote for &ldquo;keep
            suffering in the same way you&rsquo;re already suffering.&rdquo; And it&rsquo;s
            almost always the most expensive option on the table.
          </p>

          <h2
            style={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: -0.5,
              marginTop: 40,
              marginBottom: 16,
              color: "var(--accent-deep)",
            }}
          >
            The hidden cost of &ldquo;I&rsquo;ll decide later&rdquo;
          </h2>

          <p>
            Analysis paralysis sounds like a cute phrase until you add up what it
            actually costs you. That job you keep meaning to apply for? Someone else
            got it. The conversation you keep postponing? It&rsquo;s festering into
            resentment. The side project you keep &ldquo;researching&rdquo;?
            Three other people shipped it while you were comparing tech stacks.
          </p>

          <p>
            But the real cost isn&rsquo;t the missed opportunity. It&rsquo;s the
            mental overhead. Every undecided thing lives in your brain rent-free,
            consuming energy 24/7. You wake up thinking about it. You zone out in
            meetings thinking about it. You lie in bed at 3am running the same
            argument loop for the 47th time.
          </p>

          <p>
            Undecided decisions are background apps draining your battery. And
            most people are running like twelve of them simultaneously.
          </p>

          <h2
            style={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: -0.5,
              marginTop: 40,
              marginBottom: 16,
              color: "var(--accent-deep)",
            }}
          >
            Why you can&rsquo;t just &ldquo;decide already&rdquo;
          </h2>

          <p>
            The advice is always &ldquo;just make a decision and commit.&rdquo;
            Thanks, very helpful. The reason you can&rsquo;t decide isn&rsquo;t
            because you&rsquo;re weak or indecisive. It&rsquo;s because the debate
            is happening inside your head, where every argument fights every other
            argument with no structure, no moderator, and no endpoint.
          </p>

          <p>
            Your brain is running a parliament where everyone talks at once,
            nobody yields the floor, and there&rsquo;s no speaker to call the
            vote. Of course you&rsquo;re stuck.
          </p>

          <h2
            style={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: -0.5,
              marginTop: 40,
              marginBottom: 16,
              color: "var(--accent-deep)",
            }}
          >
            Externalize the debate
          </h2>

          <p>
            That&rsquo;s what MachaX does. You dump the messy thought&mdash;the
            half-formed, contradictory, emotional tangle of a decision&mdash;and
            four AI agents pick it apart for you.
          </p>

          <p>
            One agent pokes at your fears. Another simplifies it to actual
            options. A third makes the call. And the last one turns the action
            into something you&rsquo;ll actually do (with XP and a quest name like
            &ldquo;Brave Little Samosa&rdquo; because why not).
          </p>

          <p>
            The whole thing takes about 3 minutes. You go from &ldquo;I&rsquo;ve
            been agonizing about this for two weeks&rdquo; to &ldquo;okay, I&rsquo;m
            doing this one thing in the next 20 minutes.&rdquo;
          </p>

          <p>
            Wrong decisions can be corrected. Most of the time, they teach you
            something. But the decision you never make? That just keeps costing
            you, silently, every single day.
          </p>

          <p
            style={{
              fontFamily: "var(--font-caveat), cursive",
              color: "var(--marker)",
              fontSize: 22,
              fontWeight: 600,
              transform: "rotate(-1deg)",
              marginTop: 32,
            }}
          >
            stop thinking. start doing.
          </p>
        </div>

        {/* CTA */}
        <div
          className="closing"
          style={{ marginTop: 48, textAlign: "center" as const }}
        >
          <h2
            style={{
              fontFamily: "var(--font-serif), serif",
              fontWeight: 700,
              fontSize: "clamp(28px, 4vw, 42px)",
              lineHeight: 1,
              letterSpacing: -1,
              margin: "0 0 12px",
              position: "relative",
            }}
          >
            Done overthinking?
          </h2>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 16,
              margin: "0 auto 24px",
              maxWidth: "38ch",
              position: "relative",
            }}
          >
            Dump the decision. Get one clear action. Move on with your life.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap" as const,
              position: "relative",
            }}
          >
            <Link href="/chat" className="try-btn">
              try it now &rarr;
            </Link>
            <Link
              href="/"
              className="try-btn"
              style={{
                background: "var(--accent)",
                color: "#fff",
                borderColor: "var(--accent)",
              }}
            >
              machax.xyz &rarr;
            </Link>
          </div>
        </div>
      </article>

      {/* FOOTER */}
      <div className="wrap">
        <footer>
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
              Macha
              <LogoCup />
            </div>
          </Link>
          <div>&copy; 2026 &middot; Bengaluru</div>
        </footer>
      </div>
    </>
  );
}
