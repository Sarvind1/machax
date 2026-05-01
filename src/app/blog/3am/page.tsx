import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Built This Because My Brain Wouldn't Shut Up at 3am — MachaX",
  description:
    "The founder story behind MachaX — a tool born from too many sleepless nights spent arguing with yourself about decisions that shouldn't be this hard.",
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

export default function ThreeAmPost() {
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
          Built This Because My Brain Wouldn&rsquo;t Shut Up at 3am
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            I&rsquo;m writing this at 2:47am because of course I am. This is
            when my brain does its best work&mdash;by &ldquo;best work&rdquo; I
            mean running the same three arguments in a loop until I want to
            throw my phone at the wall.
          </p>

          <p>
            Should I leave my job? The pay is good but the work is soul-crushing.
            But the market is bad. But I have savings. But what if the savings run
            out? But what if I stay and waste another year? But what if&mdash;
          </p>

          <p>
            You know the loop. If you&rsquo;re reading this at 3am, you&rsquo;re
            probably in one right now.
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
            I tried everything
          </h2>

          <p>
            Journaling. Pros and cons lists. Talking to friends (at reasonable
            hours). Meditation apps. That one self-help book everyone recommends.
            Therapy, which actually helped with the big stuff but couldn&rsquo;t
            fix the Tuesday night &ldquo;should I message my old manager about
            that role or is that desperate&rdquo; spiral.
          </p>

          <p>
            Then I tried ChatGPT. And it gave me a perfectly reasonable,
            balanced, utterly useless answer. &ldquo;There are pros and cons to
            both options. Consider your values and priorities.&rdquo; Thanks, I
            hadn&rsquo;t thought of that.
          </p>

          <p>
            The problem with one AI giving one answer is that it&rsquo;s just
            another voice in the parliament. My brain already has four opinions.
            I don&rsquo;t need a fifth. I need someone to run the damn meeting.
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
            So I built the thing I needed
          </h2>

          <p>
            MachaX started as a janky prototype I made for myself. Four AI
            agents, each with a specific role: one to poke at my fears, one to
            simplify, one to decide, one to make me actually do the thing. A
            council. A parliament. A jury that actually reaches a verdict.
          </p>

          <p>
            The first time I used it for real&mdash;3am, couldn&rsquo;t sleep,
            spiraling about whether to take a freelance project&mdash;it gave me
            a clear answer in about 2 minutes. Not a perfect answer. But a
            decisive one. And I slept. For the first time in like four days, I
            actually slept.
          </p>

          <p>
            I started using it for everything. Career stuff. Relationship stuff.
            &ldquo;Should I buy this thing or is that retail therapy?&rdquo;
            stuff. And every time, the pattern was the same: dump the messy
            thought, let the agents argue, get one action, feel weirdly lighter.
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
            It&rsquo;s not therapy. It&rsquo;s a tiebreaker.
          </h2>

          <p>
            I want to be clear about that. If you&rsquo;re dealing with serious
            mental health stuff, please talk to a professional. MachaX is for the
            everyday decision paralysis&mdash;the stuff that&rsquo;s not big
            enough for therapy but too sticky for a pros and cons list.
          </p>

          <p>
            It&rsquo;s the thing I wish existed all those nights I lay awake
            arguing with myself. Now it does.
          </p>

          <p>
            If you&rsquo;re reading this at 3am, try it. Seriously. Dump
            whatever&rsquo;s keeping you up. Let the council argue it out. Then
            go to sleep.
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
            go to sleep. the council will handle it.
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
            Can&rsquo;t sleep?
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
            Dump the thought. Let four agents argue it out. Get one clear action.
            Then actually sleep.
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
