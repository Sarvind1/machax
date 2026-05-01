import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Meet the Parliament: 4 AI Agents That Argue So You Don't Have To — MachaX",
  description:
    "Fomo, Didi, Boss, and Hype — four AI agents that debate your messy thoughts and hand you one clear action. Here's how they work.",
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

export default function AgentsPost() {
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
          Meet the Parliament: 4 AI Agents That Argue So You Don&rsquo;t Have To
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            Most AI tools give you one answer. One perspective. One confidently
            wrong take dressed up as wisdom. MachaX gives you four agents who
            actually disagree with each other&mdash;because that&rsquo;s how good
            decisions actually get made.
          </p>

          <p>
            Think about how you make decisions in real life. You don&rsquo;t just
            think one thought and act. You argue with yourself. The anxious part
            of your brain fights the impulsive part. The rational part tries to
            mediate. The playful part wonders if any of this even matters.
          </p>

          <p>
            Your brain already runs a parliament. MachaX just makes it visible,
            structured, and way less exhausting.
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
            The four members of your council
          </h2>

          <div
            style={{
              display: "grid",
              gap: 16,
              margin: "24px 0",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "var(--fomo)",
                fontSize: 15,
              }}
            >
              <strong style={{ fontSize: 17 }}>Fomo &mdash; The Uncomfortable Question Asker</strong>
              <br />
              Fomo&rsquo;s job is to say the thing you&rsquo;re avoiding. Thinking
              about quitting your job? Fomo asks &ldquo;Are you running from
              something or toward something?&rdquo; Considering texting your ex?
              Fomo goes &ldquo;What exactly do you think will be different this
              time?&rdquo; Fomo is the friend who loves you enough to make you
              uncomfortable.
            </div>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong style={{ fontSize: 17 }}>Didi &mdash; The Voice of Reason</strong>
              <br />
              While everyone else is spiraling, Didi calmly cuts through the noise.
              &ldquo;Okay, you actually have three options here. Let me lay them
              out.&rdquo; No philosophy. No deep questions. Just clean, simple
              choices with clear trade-offs. Didi is the friend who makes you
              feel like maybe this isn&rsquo;t as complicated as you thought.
            </div>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong style={{ fontSize: 17 }}>Boss &mdash; The Decider</strong>
              <br />
              Boss listens to Fomo&rsquo;s concerns and Didi&rsquo;s options, then
              makes the call. &ldquo;You&rsquo;re doing option 2. Here&rsquo;s
              why. Here&rsquo;s what you do first.&rdquo; No hedging. No &ldquo;it
              depends.&rdquo; Boss picks one path and commits. Someone has to, and
              it clearly wasn&rsquo;t going to be you.
            </div>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong style={{ fontSize: 17 }}>Hype &mdash; The Cheerleader</strong>
              <br />
              Hype takes Boss&rsquo;s decision and makes it something you&rsquo;ll
              actually do. How? By turning it into a quest. You get XP. You get
              a streak. You get ridiculous quest names like &ldquo;Brave Little
              Samosa&rdquo; or &ldquo;The Audacity Audit.&rdquo; Hype knows that
              the best action plan in the world is worthless if you don&rsquo;t
              feel like doing it.
            </div>
          </div>

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
            Why four beats one
          </h2>

          <p>
            Single-AI tools give you a single perspective. It&rsquo;s like asking
            one friend for advice&mdash;you get their bias, their blind spots,
            their one framework for everything.
          </p>

          <p>
            Multiple agents that actually argue create something closer to how
            good decisions happen in the real world: through disagreement,
            simplification, and then someone finally saying &ldquo;alright,
            here&rsquo;s what we&rsquo;re doing.&rdquo;
          </p>

          <p>
            The parliament isn&rsquo;t a gimmick. It&rsquo;s a structure. Your
            brain already does this&mdash;just badly, at 3am, with no
            resolution. MachaX runs the same debate but with turn-taking, a
            moderator, and an actual outcome.
          </p>

          <p>
            Dump your thought. Let them argue. Get one action. Move on.
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
            the council has spoken.
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
            Ready to meet your council?
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
            Four agents. One messy thought. One clear action.
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
