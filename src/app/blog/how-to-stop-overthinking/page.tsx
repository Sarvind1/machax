import { createMetadata } from "@/lib/seo";
import { StructuredData } from "@/components/structured-data";
import Link from "next/link";

export const metadata = createMetadata({
  title: "How to Stop Overthinking: A Method That Actually Works",
  description:
    "Common advice for overthinking doesn't work. Here's a 3-step method backed by CBT and multi-agent debate that breaks the loop in minutes, not weeks.",
  slug: "blog/how-to-stop-overthinking",
  type: "article",
  publishedTime: "2026-05-01",
  keywords: [
    "how to stop overthinking",
    "stop overthinking",
    "overthinking cure",
    "analysis paralysis solution",
    "decision making technique",
    "how to decide",
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
    question: "Why can't I stop overthinking?",
    answer:
      "Your brain has multiple perspectives on the same problem and no mechanism to resolve the conflict between them. The cautious part of you argues with the ambitious part, and neither wins — so the loop continues. Overthinking isn't a character flaw; it's a missing tiebreaker.",
  },
  {
    question: "Is overthinking a sign of anxiety?",
    answer:
      "It can be. Chronic overthinking is a common symptom of generalized anxiety disorder. But it's also a completely normal response to genuinely complex decisions — career moves, relationship changes, financial choices. If overthinking is disrupting your sleep, work, or relationships on a regular basis, it's worth talking to a professional.",
  },
  {
    question: "What is the best technique to stop overthinking?",
    answer:
      "Externalization — getting the debate out of your head and into a structured conversation. This is a core principle of cognitive behavioral therapy (CBT). Whether you do it with a therapist, a friend, a journal, or a multi-agent AI tool, the act of making your internal arguments visible breaks the loop.",
  },
  {
    question: "How do I make a decision when I can't decide?",
    answer:
      "Stop trying to decide the whole thing. Reduce the decision to one next action — the smallest concrete step you can take in the next 20 minutes. You don't need to solve your career; you need to send one email. You don't need to figure out the relationship; you need to have one conversation.",
  },
  {
    question: "Does journaling help with overthinking?",
    answer:
      "Yes — journaling is a form of externalization that helps you see your thoughts instead of just feeling them. But conversation (even with AI) tends to work faster because it introduces perspectives you wouldn't generate on your own. Journaling is you arguing with yourself on paper; conversation adds new voices to the debate.",
  },
];

export default function HowToStopOverthinkingPost() {
  return (
    <>
      <StructuredData
        type="BlogPosting"
        data={{
          headline: "How to Stop Overthinking: A Method That Actually Works",
          description:
            "Common advice for overthinking doesn't work. Here's a 3-step method backed by CBT and multi-agent debate that breaks the loop in minutes, not weeks.",
          datePublished: "2026-05-01",
          url: "https://machax.xyz/blog/how-to-stop-overthinking",
        }}
      />
      <StructuredData
        type="HowTo"
        data={{
          name: "How to Stop Overthinking in 3 Steps",
          description:
            "A practical method to break the overthinking loop by externalizing the internal debate, letting different perspectives argue, and committing to one next action.",
          steps: [
            {
              name: "Dump the thought",
              text: "Write out the thing you're overthinking, exactly as it exists in your head. Messy, unfiltered, no structure required. The goal is to get it out of your brain and into a format you can look at instead of just feel.",
            },
            {
              name: "Let different perspectives argue",
              text: "Instead of YOU weighing all sides, let external voices do it. This is what therapy groups, advisory boards, and multi-agent AI tools do — they surface perspectives you wouldn't generate on your own and argue them out so you don't have to.",
            },
            {
              name: "Pick one action, not the whole plan",
              text: "Don't decide the entire thing. Just decide the NEXT MOVE — one concrete action you can do in 20 minutes. You don't need to solve your career. You need to send one message, make one call, or write one email.",
            },
          ],
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
          How to Stop Overthinking: A Method That Actually Works
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          {/* Section 1: You're Not Broken */}
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
            You&rsquo;re not broken &mdash; your brain has no tiebreaker
          </h2>

          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            If you&rsquo;re reading this at 2am, wondering whether to take the
            job, text them back, or move cities&mdash;you&rsquo;re not
            overthinking because something is wrong with you. You&rsquo;re
            overthinking because your brain has multiple opinions and no way to
            resolve them.
          </p>

          <p>
            There&rsquo;s a cautious voice listing everything that could go
            wrong. An ambitious voice whispering about the upside. A practical
            voice asking about money. And somewhere in the background, a quiet
            voice going &ldquo;but what if it&rsquo;s actually amazing?&rdquo;
          </p>

          <p>
            They don&rsquo;t take turns. They don&rsquo;t reach consensus.
            There&rsquo;s no moderator. Just a permanent 4-way argument with no
            closing statement. That&rsquo;s not a thinking problem. That&rsquo;s
            a structure problem.
          </p>

          {/* Section 2: Why Common Advice Fails */}
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
            Why common advice fails
          </h2>

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
              <strong>&ldquo;Just stop thinking about it.&rdquo;</strong>{" "}
              Doesn&rsquo;t work. Telling your brain not to think about
              something is like telling yourself not to picture a pink
              elephant. The thought gets louder.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>&ldquo;Make a pros and cons list.&rdquo;</strong> Creates
              more analysis, not less. Now you&rsquo;re overthinking whether
              you&rsquo;ve listed the right pros and weighed them correctly.
              Congratulations, you&rsquo;ve added a meta-layer to your spiral.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>&ldquo;Trust your gut.&rdquo;</strong> Your gut has 4
              conflicting opinions. Which gut? The one that says play it safe,
              or the one that says take the leap? Gut instincts are useful when
              you have one. Overthinkers have several.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong>&ldquo;Sleep on it.&rdquo;</strong> You wake up and the
              loop restarts. Worse, now you&rsquo;ve added sleep deprivation to
              the mix, so your decision-making capacity is actually lower than
              it was last night.
            </div>
          </div>

          {/* Section 3: The Method */}
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
            The method: externalize, argue, decide
          </h2>

          <p>
            Instead of trying to quiet the voices, give them a stage. Get the
            debate out of your head and into a format where it can actually
            resolve.
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
            <div style={{ marginBottom: 16 }}>
              <strong>Step 1: Dump the thought.</strong> Write it out exactly as
              it is in your head. Messy. Unfiltered. No structure. Don&rsquo;t
              try to be articulate. The 3am version is fine.
            </div>
            <div style={{ marginBottom: 16 }}>
              <strong>Step 2: Let different perspectives argue.</strong> Instead
              of YOU weighing all sides, let external voices do it. This is what
              therapy groups, good friends, and advisory boards do. Different
              people see different things. The key is{" "}
              <em>genuine disagreement</em>&mdash;not polite consensus.
            </div>
            <div>
              <strong>Step 3: Pick the one action, not the whole plan.</strong>{" "}
              Don&rsquo;t decide the entire thing. Just decide the NEXT MOVE.
              One concrete action you can do in 20 minutes. Not &ldquo;figure
              out my career&rdquo;&mdash;more like &ldquo;text Priya and ask
              what the day-to-day is actually like.&rdquo;
            </div>
          </div>

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

          {/* Section 4: Why This Works */}
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
            Why this works (the science)
          </h2>

          <p>
            This isn&rsquo;t just a productivity hack. The method maps onto
            several well-established frameworks:
          </p>

          <p>
            <strong>Externalization in CBT.</strong> Cognitive behavioral therapy
            has long used externalization&mdash;making internal thoughts visible
            and examinable&mdash;as a core technique for breaking rumination
            loops. When you can <em>see</em> the thought instead of just{" "}
            <em>feeling</em> it, you can work with it.
          </p>

          <p>
            <strong>Kahneman&rsquo;s System 1 and System 2.</strong> Daniel
            Kahneman&rsquo;s research shows that our fast, intuitive brain
            (System 1) and our slow, analytical brain (System 2) often
            conflict. Overthinking happens when System 2 keeps overriding
            System 1 without reaching a conclusion. External debate forces a
            resolution.
          </p>

          <p>
            <strong>Minsky&rsquo;s Society of Mind.</strong> Marvin Minsky
            proposed that the mind isn&rsquo;t a single entity but a
            &ldquo;society&rdquo; of many smaller agents, each with different
            goals and methods. Multi-agent AI mirrors this architecture&mdash;
            instead of one AI pretending to be objective, multiple agents
            represent genuinely different perspectives.
          </p>

          <p>
            <strong>Internal Family Systems (IFS).</strong> IFS therapy treats
            different &ldquo;parts&rdquo; of the self as having their own
            perspectives, fears, and motivations. The therapeutic move is to
            give each part a voice and then find the path forward. MachaX does
            something similar with four distinct agents: Fomo (the worrier),
            Didi (the simplifier), Boss (the decider), and Hype (the
            motivator).
          </p>

          {/* Section 5: Try It Right Now */}
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
            Try it right now
          </h2>

          <p>
            Open MachaX. Type the thing you&rsquo;ve been going in circles
            about. Don&rsquo;t overthink the input (ironic, we know). Just dump
            it. Three minutes. Four agents. One action.
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
            the council has spoken. now do the thing.
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
            Done overthinking about overthinking?
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
            Dump your worst thought. Your council handles the rest.
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
