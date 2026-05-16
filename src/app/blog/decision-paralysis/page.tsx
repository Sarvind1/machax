import { createMetadata } from "@/lib/seo";
import { StructuredData } from "@/components/structured-data";
import Link from "next/link";

export const metadata = createMetadata({
  title:
    "Decision Paralysis: Why You Can't Choose (And the 3-Minute Fix)",
  description:
    "Decision paralysis affects 40% of professionals making career decisions. Learn why your brain gets stuck, the science behind it, and a 3-minute technique to break through.",
  slug: "blog/decision-paralysis",
  type: "article",
  publishedTime: "2026-05-01",
  keywords: [
    "decision paralysis",
    "analysis paralysis",
    "can't decide",
    "how to overcome decision paralysis",
    "decision fatigue",
    "paradox of choice",
  ],
});

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

const faqItems = [
  {
    question: "What causes decision paralysis?",
    answer:
      "Decision paralysis is caused by a combination of too many options (the paradox of choice), fear of making the wrong choice (loss aversion), and having no internal mechanism to break a tie between competing perspectives. When your brain can argue equally well for multiple options, it defaults to inaction.",
  },
  {
    question: "How do I overcome analysis paralysis?",
    answer:
      "The most effective technique is externalization — getting the debate out of your head and into a structured format. Instead of letting your internal voices argue in circles, use an external system (a trusted friend, a therapist, or a multi-agent AI tool like MachaX) to surface all perspectives and force a concrete next action.",
  },
  {
    question: "Is decision paralysis a mental health condition?",
    answer:
      "Decision paralysis is not a clinical disorder on its own. However, chronic indecision can be a symptom of anxiety disorders, depression, or ADHD. If decision paralysis is significantly impacting your daily life and relationships, it's worth talking to a mental health professional.",
  },
  {
    question: "What is the best tool for making decisions?",
    answer:
      "The best decision tools provide multiple perspectives rather than a single recommendation. Multi-agent AI tools like MachaX use four distinct agents that genuinely disagree with each other, mirroring how a good advisory board works — surfacing blind spots and forcing a clear action instead of endless deliberation.",
  },
  {
    question: "How long should a decision take?",
    answer:
      "Most daily decisions (what to eat, whether to reply to an email, which task to start with) should take under 2 minutes. Bigger decisions (career moves, relationship changes, financial choices) benefit from a structured 3-5 minute deliberation — long enough to surface key perspectives, short enough to avoid the overthinking spiral.",
  },
];

export default function DecisionParalysisPost() {
  return (
    <>
      <StructuredData
        type="BlogPosting"
        data={{
          headline:
            "Decision Paralysis: Why You Can't Choose (And the 3-Minute Fix)",
          description:
            "Decision paralysis affects 40% of professionals making career decisions. Learn why your brain gets stuck, the science behind it, and a 3-minute technique to break through.",
          datePublished: "2026-05-01",
          url: "https://machax.xyz/blog/decision-paralysis",
        }}
      />
      <StructuredData
        type="FAQPage"
        data={{
          items: faqItems,
        }}
      />

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
          May 2026
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
          Decision Paralysis: Why You Can&rsquo;t Choose (And the 3-Minute Fix)
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            You&rsquo;ve been staring at the same two options for a week. Maybe
            longer. You know you need to decide, but every time you get close,
            your brain serves up another &ldquo;but what if&rdquo; and you&rsquo;re
            back to square one.
          </p>

          {/* Section 1: What Is Decision Paralysis? */}
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
            What is decision paralysis?
          </h2>

          <p>
            Decision paralysis (also called analysis paralysis) is the state of
            overthinking a choice to the point where no decision gets made. Your
            brain keeps gathering information, weighing options, and running
            scenarios&mdash;but never commits to an action.
          </p>

          <p>
            It affects roughly 40% of professionals making career decisions, and
            it shows up everywhere: what city to live in, whether to end a
            relationship, which job offer to take, even what to order for dinner
            when the menu has 47 items.
          </p>

          <p>
            The most famous demonstration comes from psychologist Sheena
            Iyengar&rsquo;s jam study. When a grocery store displayed 24
            varieties of jam, only 3% of shoppers bought one. When they
            displayed just 6 varieties, 30% bought. Ten times more action, from
            fewer options. Your brain isn&rsquo;t built for unlimited choice.
          </p>

          {/* Section 2: Why Your Brain Gets Stuck */}
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
            Why your brain gets stuck
          </h2>

          <p>Three things conspire to keep you frozen:</p>

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
              <strong>Too many options.</strong> The paradox of choice: more
              options should mean a better outcome, but in practice, more
              options means more comparison, more doubt, and less action.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Fear of regret.</strong> Loss aversion makes the potential
              pain of a wrong choice feel twice as heavy as the potential
              pleasure of a right one. So you avoid choosing at all.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>No tiebreaker.</strong> This is the real problem. Your
              internal voices&mdash;the cautious one, the ambitious one, the
              practical one, the reckless one&mdash;argue endlessly with no
              moderator and no final vote. The debate never closes.
            </div>
          </div>

          {/* Section 3: The Cost of Not Deciding */}
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
            The cost of not deciding
          </h2>

          <p>
            Not deciding is a decision. It&rsquo;s choosing the status quo by
            default. Every day you spend &ldquo;still thinking about it&rdquo;
            is a day you&rsquo;ve chosen to stay exactly where you are.
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
            &ldquo;The cost of being wrong is less than the cost of doing
            nothing.&rdquo;
          </div>

          <p>
            Barry Schwartz, author of <em>The Paradox of Choice</em>, found
            that chronic indecision correlates with lower life satisfaction,
            higher anxiety, and more regret&mdash;not less. The people who
            agonize longest over decisions end up less happy with their choices
            than people who decide quickly and move on. The irony is brutal:
            trying harder to make the &ldquo;perfect&rdquo; choice makes every
            choice feel worse.
          </p>

          {/* Section 4: The 3-Minute Fix */}
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
            The 3-minute fix: externalize the debate
          </h2>

          <p>
            Here&rsquo;s what actually works: stop trying to resolve the
            argument inside your head. Get it outside your head instead.
          </p>

          <p>
            This is why therapy works. This is why calling your best friend at
            midnight works. This is why writing it out on paper sometimes
            unsticks you. The act of externalizing the debate&mdash;making the
            invisible arguments visible&mdash;lets you see what&rsquo;s
            actually being argued instead of feeling the fog of it all.
          </p>

          <p>
            MachaX takes this idea and structures it. Instead of one AI voice
            that agrees with whatever you say, you get four agents with
            different perspectives. They argue with each other. They disagree.
            And at the end, you get one concrete action&mdash;not a framework,
            not a list, just the next thing to do.
          </p>

          <img
            src="/blog/chat-conversation.png"
            alt="MachaX AI agents debating a career decision with genuine disagreement"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          <p>
            The debate takes about 30 seconds. Reading through the perspectives
            takes another minute or two. And then you have something you
            didn&rsquo;t have before: a clear next move, picked by a council
            instead of your spiraling brain.
          </p>

          <img
            src="/blog/decision-panel.png"
            alt="MachaX decision panel showing two clear options after agent debate"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          {/* Section 5: FAQ */}
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
            Frequently asked questions
          </h2>

          {faqItems.map((item, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontFamily: "var(--font-serif), serif",
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: -0.3,
                  marginBottom: 8,
                  color: "var(--ink)",
                }}
              >
                {item.question}
              </h3>
              <p style={{ marginTop: 0 }}>{item.answer}</p>
            </div>
          ))}

          {/* CTA line */}
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
            try MachaX free &mdash; dump your messy thought, get one clear
            action in 3 minutes.
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
            Still stuck on that decision?
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
