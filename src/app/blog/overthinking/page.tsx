import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why Your Brain Argues With Itself at 3am — MachaX",
  description:
    "You're not broken. Your brain just has 4 opinions and no tiebreaker. Here's why we built a council of AI agents to do the overthinking for you.",
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

export default function OverthinkingPost() {
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
          Why Your Brain Argues With Itself at 3am
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            You know the feeling. It&rsquo;s 3am. You should be asleep. Instead,
            your brain is running a full parliamentary debate about whether you
            should quit your job, text your ex, or finally start that side
            project.
          </p>

          <p>
            Nobody votes. Nobody wins. You just lie there, staring at the
            ceiling, cycling through the same four arguments until your alarm
            goes off and you&rsquo;ve decided exactly nothing.
          </p>

          <p>
            I&rsquo;ve been that person my entire life. Not the &ldquo;I
            can&rsquo;t decide between pizza or pasta&rdquo; kind of
            indecisive&mdash;the kind where I can argue myself into and out of
            the same decision fourteen times before breakfast.
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
            Your brain has 4 opinions and no tiebreaker
          </h2>

          <p>
            Here&rsquo;s what I figured out after years of this: the problem
            isn&rsquo;t that you think too much. It&rsquo;s that the voices in
            your head are unstructured. You&rsquo;ve got the anxious voice
            listing worst-case scenarios. The rational voice trying to make a
            spreadsheet. The impulsive voice saying &ldquo;just do it
            already.&rdquo; And somewhere in the back, a little voice going
            &ldquo;but what if it&rsquo;s actually fun?&rdquo;
          </p>

          <p>
            They all talk at once. They never take turns. There&rsquo;s no
            moderator, no agenda, no final vote. Just vibes and dread.
          </p>

          <p>
            The self-help advice is always &ldquo;journal about it&rdquo; or
            &ldquo;talk to a friend.&rdquo; And yeah, those work&mdash;when
            it&rsquo;s 2pm on a Tuesday and your friend is free. Not at 3am when
            you&rsquo;re doom-spiraling about whether to take the pay cut for
            the startup job.
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
            What if the debate happened outside your head?
          </h2>

          <p>
            That&rsquo;s the idea behind MachaX. Instead of one AI giving you
            one generic answer, you get four agents&mdash;each with a different
            job&mdash;who actually argue it out.
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
              <strong>Fomo</strong> &mdash; the overthinker. Asks the
              uncomfortable questions you&rsquo;re avoiding. &ldquo;Are you
              tired of the job or tired of yourself?&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Didi</strong> &mdash; voice of reason. Cuts the spiral
              into 2&ndash;3 actual options. No philosophy, just choices.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>Boss</strong> &mdash; the decider. Picks one option.
              Gives you the ruling. Done.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong>Hype</strong> &mdash; your cheerleader. Turns the action
              into a quest with XP, streaks, and dumb trophy names so you
              actually do it.
            </div>
          </div>

          <p>
            You dump your raw, messy, 3am thought. They debate it. Not in a
            polite, corporate &ldquo;here are some considerations&rdquo;
            way&mdash;they actually disagree. Fomo complicates it, Didi
            simplifies it, Boss makes the call, Hype makes it fun.
          </p>

          <p>
            The output isn&rsquo;t a therapy session or a 12-step plan.
            It&rsquo;s one thing you can do in the next 20 minutes. Text your
            old manager. Send the counter-offer. Delete the app. Whatever. One
            action, decided by committee so your brain doesn&rsquo;t have to.
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
            It won&rsquo;t fix your life
          </h2>

          <p>
            I want to be honest about that. MachaX isn&rsquo;t therapy. It&rsquo;s
            not a life coach. It&rsquo;s not going to solve your career crisis
            or your relationship problems.
          </p>

          <p>
            But it will fix your Tuesday. It&rsquo;ll take that 45-minute spiral
            and turn it into a 3-minute conversation with a clear next step. And
            sometimes that&rsquo;s enough. Sometimes the hardest part
            isn&rsquo;t knowing what to do&mdash;it&rsquo;s getting out of your
            own head long enough to do it.
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
            Ready to outsource the spiral?
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
            Dump your worst 3am thought. Your council handles the rest.
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
              join the waitlist &rarr;
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
