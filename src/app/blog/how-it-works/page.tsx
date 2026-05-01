import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How MachaX Works: From Messy Thought to One Clear Action — MachaX",
  description:
    "A simple walkthrough of MachaX: dump your thought, four AI agents debate it, you get one action with XP and quests. Not therapy. Not a to-do app. A tiebreaker.",
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

export default function HowItWorksPost() {
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
          How MachaX Works: From Messy Thought to One Clear Action
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            MachaX isn&rsquo;t a chatbot. It&rsquo;s not a therapist. It&rsquo;s
            not a to-do app. It&rsquo;s a tiebreaker for your brain. Here&rsquo;s
            exactly how it works, start to finish.
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
            Step 1: Dump the thought
          </h2>

          <p>
            Open MachaX. Type whatever&rsquo;s on your mind. No formatting
            required. No need to be articulate. Just the raw, messy, 3am version
            of whatever&rsquo;s bugging you.
          </p>

          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 15,
              margin: "16px 0",
              fontStyle: "italic",
            }}
          >
            &ldquo;got offered a role at a startup, pays 30% less but the work
            seems cool, current job is stable but boring, idk what to do, been
            thinking about this for 2 weeks&rdquo;
          </div>

          <p>
            That&rsquo;s it. That&rsquo;s the input. No prompting tricks. No
            &ldquo;act as a career coach.&rdquo; Just your actual thought.
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
            Step 2: The parliament debates
          </h2>

          <p>
            Four AI agents take your thought and argue about it. Each has a
            specific role:
          </p>

          <div
            style={{
              display: "grid",
              gap: 12,
              margin: "24px 0",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--fomo)",
                fontSize: 15,
              }}
            >
              <strong>Fomo</strong> pokes at what you&rsquo;re not saying.
              &ldquo;You said the work &lsquo;seems cool&rsquo;&mdash;have you
              actually talked to anyone who works there?&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Didi</strong> simplifies. &ldquo;You have two real options:
              take the offer, or stay and set a 6-month re-evaluate date.&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>Boss</strong> decides. &ldquo;Take the call with the
              startup founder this week. That&rsquo;s your next move. Everything
              else is premature.&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong>Hype</strong> gamifies it. &ldquo;Quest unlocked: The
              Audacity Audit. Schedule the call. +50 XP.&rdquo;
            </div>
          </div>

          <p>
            They don&rsquo;t agree with each other. That&rsquo;s the point.
            Fomo complicates, Didi simplifies, Boss cuts through, Hype makes it
            fun. The whole debate takes about 30 seconds.
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
            Step 3: One action, not a plan
          </h2>

          <p>
            The output isn&rsquo;t a 10-step framework or a SWOT analysis.
            It&rsquo;s one specific thing you can do in the next 20 minutes.
            Not &ldquo;evaluate your career goals&rdquo;&mdash;more like
            &ldquo;open LinkedIn and message Priya about what the day-to-day
            is actually like.&rdquo;
          </p>

          <p>
            One action. Concrete. Doable right now. That&rsquo;s the whole point.
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
            Step 4: Gamified follow-through
          </h2>

          <p>
            This is the part most decision tools skip. Getting the answer is
            easy&mdash;actually doing the thing is where people bail. So MachaX
            wraps your action in game mechanics:
          </p>

          <div
            style={{
              margin: "20px 0",
              padding: "18px 20px",
              borderRadius: 12,
              border: "1.5px solid var(--line)",
              background: "var(--card)",
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong>XP</strong> &mdash; earn points for completing actions.
              Build your score over time.
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Quests</strong> &mdash; every action gets a ridiculous quest
              name. &ldquo;Brave Little Samosa.&rdquo; &ldquo;Operation: Stop
              Spiraling.&rdquo; &ldquo;The Yolo Protocol.&rdquo;
            </div>
            <div>
              <strong>Streaks</strong> &mdash; consecutive days of taking action
              build a streak. Miss a day, streak resets. Simple but weirdly
              effective.
            </div>
          </div>

          <p>
            Is it silly? Yes. Does it work? Also yes. Turns out your brain
            responds really well to fake internet points when they&rsquo;re
            attached to real decisions.
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
            What MachaX is NOT
          </h2>

          <p>
            It&rsquo;s not therapy. If you&rsquo;re dealing with serious mental
            health issues, please talk to a real professional. MachaX is for
            everyday decision paralysis&mdash;career moves, relationship
            conversations, money choices, that project you keep putting off.
          </p>

          <p>
            It&rsquo;s not a to-do app. It doesn&rsquo;t manage your tasks. It
            gives you the one next task when you&rsquo;re too stuck to figure it
            out yourself.
          </p>

          <p>
            It&rsquo;s a tiebreaker. That&rsquo;s it. And sometimes, that&rsquo;s
            exactly what you need.
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
            messy thought in, clear action out.
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
            Got a messy thought?
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
            Three minutes. Four agents. One clear action.
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
