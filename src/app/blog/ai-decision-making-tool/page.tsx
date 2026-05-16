import { createMetadata } from "@/lib/seo";
import { StructuredData } from "@/components/structured-data";
import Link from "next/link";

export const metadata = createMetadata({
  title:
    "AI Decision-Making Tool: Why You Need Agents That Disagree",
  description:
    "ChatGPT agrees with you. That's the problem. Learn why multi-agent AI that argues with itself makes better decisions than a single agreeable voice.",
  slug: "blog/ai-decision-making-tool",
  type: "article",
  publishedTime: "2026-05-01",
  keywords: [
    "AI decision making tool",
    "AI for decisions",
    "decision making AI",
    "MachaX",
    "AI agents disagree",
    "ChatGPT alternative for decisions",
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
    question: "Can AI help me make better decisions?",
    answer:
      "Yes — specifically multi-agent AI that provides conflicting perspectives. A single AI voice tends toward agreement (sycophancy), which reinforces your existing biases. Multiple agents that genuinely disagree surface blind spots and force you to confront trade-offs you might otherwise avoid.",
  },
  {
    question: "What is the best AI for decision making?",
    answer:
      "The best AI decision tools are the ones that disagree with you, not agree with you. Look for tools that provide multiple perspectives, genuine conflict between viewpoints, and a clear action as output — not a framework or a list of considerations.",
  },
  {
    question: "Is MachaX free?",
    answer:
      "Yes. MachaX is currently in free beta. You can try it right now at machax.xyz — no sign-up required. Dump any decision you're stuck on and get four different perspectives plus one clear next action in about three minutes.",
  },
  {
    question: "How is MachaX different from ChatGPT?",
    answer:
      "ChatGPT uses a single AI voice that tends to agree with whatever framing you give it. MachaX uses four distinct agents — Fomo, Didi, Boss, and Hype — that genuinely disagree with each other. The result is a debate, not a confirmation of what you already think.",
  },
  {
    question: "Does MachaX replace therapy?",
    answer:
      "No. MachaX is a tiebreaker for everyday decisions — career moves, relationship conversations, money choices, daily dilemmas. It's not a mental health tool and it's not a substitute for professional help. If you're dealing with clinical anxiety, depression, or other mental health conditions, please talk to a licensed therapist.",
  },
];

export default function AiDecisionMakingToolPost() {
  return (
    <>
      <StructuredData
        type="BlogPosting"
        data={{
          headline:
            "AI Decision-Making Tool: Why You Need Agents That Disagree",
          description:
            "ChatGPT agrees with you. That's the problem. Learn why multi-agent AI that argues with itself makes better decisions than a single agreeable voice.",
          datePublished: "2026-05-01",
          url: "https://machax.xyz/blog/ai-decision-making-tool",
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
          AI Decision-Making Tool: Why You Need Agents That Disagree
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          {/* Section 1: The Problem with AI Advice */}
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
            The problem with AI advice
          </h2>

          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            ChatGPT agrees with you. Ask it &ldquo;should I quit my
            job?&rdquo; and it&rsquo;ll say &ldquo;that&rsquo;s a valid
            consideration!&rdquo; Ask it &ldquo;should I stay?&rdquo; and
            it&rsquo;ll say &ldquo;stability is important!&rdquo; This is
            called sycophancy, and it&rsquo;s the opposite of helpful when
            you&rsquo;re stuck.
          </p>

          <p>
            Single-voice AI has a fundamental design problem: it&rsquo;s
            optimized to be helpful and agreeable. Great for writing emails.
            Terrible for making decisions. When you&rsquo;re already arguing
            with yourself, the last thing you need is an AI that validates
            whichever side you happen to present first.
          </p>

          <p>
            You don&rsquo;t need agreement. You need a tiebreaker.
          </p>

          {/* Section 2: What Makes a Good Decision Tool */}
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
            What makes a good decision tool
          </h2>

          <p>Three things, and most tools fail all three:</p>

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
              <strong>Multiple perspectives.</strong> Not one agreeable voice,
              but several conflicting ones. A good advisor doesn&rsquo;t just
              tell you what you want to hear&mdash;they show you what
              you&rsquo;re not seeing.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Genuine disagreement.</strong> Not polite
              consensus-seeking where every option gets a &ldquo;valid
              point.&rdquo; Actual tension between viewpoints. One voice saying
              &ldquo;take the leap&rdquo; while another says &ldquo;you
              haven&rsquo;t thought this through.&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>One clear action.</strong> Not a framework. Not a SWOT
              analysis. Not &ldquo;here are some things to consider.&rdquo; One
              specific thing you can do in the next 20 minutes.
            </div>
          </div>

          {/* Section 3: How Multi-Agent AI Changes the Game */}
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
            How multi-agent AI changes the game
          </h2>

          <p>
            MachaX doesn&rsquo;t use one AI. It uses four agents, each with a
            different personality and job. They&rsquo;re designed to argue.
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
              <strong>Fomo</strong> pokes at what you&rsquo;re avoiding. Asks
              the uncomfortable question. &ldquo;You say you want to stay, but
              you&rsquo;ve been job-browsing for 3 months&mdash;what does that
              tell you?&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Didi</strong> simplifies. Cuts through the noise and
              reduces your 47 considerations to 2 real options. No philosophy,
              just choices.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>Boss</strong> decides. Picks one option. Gives you the
              ruling. Doesn&rsquo;t hedge. &ldquo;Take the call with the
              founder this week. Everything else is premature.&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong>Hype</strong> makes it fun. Turns your action into a
              quest with XP and a ridiculous name. &ldquo;Quest unlocked: The
              Audacity Audit. +50 XP.&rdquo;
            </div>
          </div>

          <img
            src="/blog/chat-conversation.png"
            alt="MachaX showing four AI agents with genuine disagreement about a startup decision"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          <p>
            The debate takes about 30 seconds. You read through the
            perspectives, see what each agent catches that the others miss, and
            at the end, you get a concrete next move. Not &ldquo;consider your
            options&rdquo;&mdash;an actual action.
          </p>

          <img
            src="/blog/decision-panel.png"
            alt="MachaX decision panel extracting two clear options from the debate"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          {/* Section 4: MachaX vs. Other Approaches */}
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
            MachaX vs. other approaches
          </h2>

          <p>
            <strong>vs. ChatGPT.</strong> One voice that agrees with you versus
            four voices that argue. ChatGPT will validate whatever framing you
            give it. MachaX will challenge it. If your decision was easy,
            you wouldn&rsquo;t be asking AI&mdash;so you need pushback, not
            agreement.
          </p>

          <p>
            <strong>vs. Therapy.</strong> $150 per session, once a week, and
            you need to book three weeks in advance. Therapy is essential for
            mental health&mdash;MachaX isn&rsquo;t a replacement. But for
            everyday decisions (&ldquo;should I take this job offer?&rdquo;
            &ldquo;should I confront my roommate?&rdquo;), you need something
            available at 2am for free that gives you a concrete answer in 3
            minutes.
          </p>

          <p>
            <strong>vs. Journaling.</strong> Journaling is you arguing with
            yourself on paper. It&rsquo;s helpful&mdash;externalization always
            is&mdash;but you&rsquo;re still limited to the perspectives already
            in your head. MachaX introduces perspectives you wouldn&rsquo;t
            generate on your own. Fomo asks the question you&rsquo;re avoiding.
            Boss makes the call you keep postponing.
          </p>

          <p>
            <strong>vs. Asking friends.</strong> Friends don&rsquo;t want to
            hurt your feelings. They hedge. They say &ldquo;it depends&rdquo;
            and &ldquo;only you can decide.&rdquo; Agents don&rsquo;t have
            social obligations. They&rsquo;re designed to push back, disagree,
            and force a resolution&mdash;the thing your friends are too polite
            to do.
          </p>

          {/* Section 5: Real Examples */}
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
            Real examples
          </h2>

          <p>People use MachaX for all kinds of stuck moments:</p>

          <p>
            <strong>Career decisions.</strong> &ldquo;Should I quit my job to
            start a startup?&rdquo; Fomo asks if you&rsquo;ve actually
            validated the idea. Didi narrows it to two paths. Boss tells you
            to take the founder call before deciding anything else. Hype turns
            it into a quest.
          </p>

          <img
            src="/blog/freelance-debate-p1.png"
            alt="Four AI agents giving different perspectives on quitting a job to go freelance"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          <p>
            <strong>Relationship decisions.</strong> &ldquo;Should I move in
            with my partner?&rdquo; &ldquo;Is this arranged marriage the right
            call?&rdquo; The agents don&rsquo;t judge&mdash;they surface the
            angles you&rsquo;re not examining. The financial angle, the
            emotional angle, the cultural angle, the &ldquo;what would you
            regret more&rdquo; angle.
          </p>

          <img
            src="/blog/arranged-marriage-debate.png"
            alt="MachaX agents debating a relationship decision from multiple cultural perspectives"
            style={{
              width: "100%",
              borderRadius: 12,
              margin: "24px 0",
              boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
            }}
          />

          <p>
            <strong>Daily decisions.</strong> &ldquo;iPhone or Android?&rdquo;
            &ldquo;Should I go to the gym or sleep in?&rdquo; &ldquo;Do I
            actually need this subscription?&rdquo; Not every decision is
            life-changing, but even small ones can spiral when you&rsquo;re in
            an overthinking mood. Three minutes to break the loop.
          </p>

          {/* Section 6: FAQ */}
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
            four agents. genuine disagreement. one action.
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
            Ready for AI that pushes back?
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
