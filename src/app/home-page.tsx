"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const copy = {
  in: {
    heroHeadline: <>Kyun nahi ho rahi <em>padhai?</em></>,
    scribble: "same question since class 10",
    closingHeadline: <>Apna worst 3am thought <em>bhejo.</em></>,
  },
  global: {
    heroHeadline: <>Why can&apos;t you just… <em>decide?</em></>,
    scribble: "same spiral since freshman year",
    closingHeadline: <>Send your worst 3am thought.</>,
  },
} as const;

type Locale = keyof typeof copy;

const demos = [
  {
    label: "should I quit?",
    messages: [
      { cls: "me", agent: "You · 11:52 pm", text: "i can't tell if i should quit my job. i think i'm just tired??" },
      { cls: "fomo", agent: "Fomo · overthinker", text: 'Okay but "tired" is doing a lot of work there. Tired of the work, the people, the commute, or the story you\'re telling yourself? Also\u2014when did you last feel un-tired? Name the day.' },
      { cls: "didi", agent: "Didi · voice of reason", text: "Parking the existential bit. Real choices tonight: <b>(a)</b> take a mental-health day Friday, <b>(b)</b> book a coffee with your old manager, <b>(c)</b> do nothing and revisit Sunday." },
      { cls: "boss", agent: "Boss · the decider", text: "Ruling: <b>(b)</b>. Lowest-risk info-gathering move. Message drafted in your clipboard." },
      { cls: "hype", agent: "Hype · your cheerleader", text: 'Quest: "The Coffee Gambit" \u2014 send the text before you brush your teeth. +60 XP. Trophy: "Brave Little Toaster." \ud83c\udfc6' },
      { cls: "me", agent: "You", text: "ok fine. sending." },
    ],
  },
  {
    label: "pay cut dilemma",
    messages: [
      { cls: "me", agent: "You · 03:17 am", text: "should i take the pay cut for the startup job or not. i hate this" },
      { cls: "fomo", agent: "Fomo · overthinker", text: '"Pay cut" is a spreadsheet answer to a feelings question. Are you losing money, or identity? Also when did "stable" start meaning "safe"?' },
      { cls: "didi", agent: "Didi · voice of reason", text: "Parking the philosophy. Real options: <b>(a)</b> take the offer, 18-month runway. <b>(b)</b> Counter-offer at current company. <b>(c)</b> Wait 2 weeks, one more interview." },
      { cls: "boss", agent: "Boss · the decider", text: "Ruling: <b>(b)</b>. Lowest regret, highest info. Draft counter-offer in your clipboard. Send before 10am tomorrow." },
      { cls: "hype", agent: "Hype · your cheerleader", text: 'Quest: "Counter-Offer Cowboy" \ud83e\udd20 \u2014 send it. +120 XP. Streak: Day 6. Bonus if you don\'t re-read it 3 times.' },
      { cls: "me", agent: "You", text: "okay i hate that you're right" },
    ],
  },
];

const LogoCup = () => (
  <svg className="logo-cup" viewBox="0 0 52 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 8 L4 52 Q4 60 12 60 L32 60 Q40 60 40 52 L38 8 Z" fill="var(--accent)" rx="4"/>
    <path d="M38 18 Q50 18 50 32 Q50 44 40 44" stroke="var(--accent)" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <path d="M14 4 Q16 0 18 4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M22 2 Q24 -2 26 2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M30 4 Q32 0 34 4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <text x="21" y="44" textAnchor="middle" fill="#fff" fontWeight="800" fontSize="32" fontFamily="sans-serif">X</text>
  </svg>
);

function WaitlistForm({ id }: { id?: string }) {
  const join = useMutation(api.waitlist.join);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const result = await join({ email });
      setEmail("");
      const toast = document.getElementById("toast")!;
      const msg = document.getElementById("toastMsg")!;
      msg.textContent = result.alreadyJoined
        ? "You're already on the list!"
        : "You're in. We'll be in touch.";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="waitlist-form" id={id} onSubmit={handleSubmit}>
      <input
        type="email"
        required
        placeholder="you@somewhere.com"
        aria-label="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Joining..." : "Join the waitlist \u2192"}
      </button>
    </form>
  );
}

function WaitlistCount() {
  const count = useQuery(api.waitlist.count);
  const display = count !== undefined ? (count + 2847).toLocaleString() : "2,847";
  return <b>{display}</b>;
}

function ChatDemo() {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const replayAnimations = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll(".bubble").forEach((b) => {
      const el = b as HTMLElement;
      el.style.animation = "none";
      el.offsetHeight;
      el.style.animation = "";
    });
  }, []);

  useEffect(() => {
    replayAnimations();
  }, [active, replayAnimations]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) replayAnimations();
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [replayAnimations]);

  return (
    <div>
      <div className="demo-tabs">
        {demos.map((d, i) => (
          <button
            key={i}
            className={`demo-tab ${i === active ? "active" : ""}`}
            onClick={() => setActive(i)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="demo-phone">
        <div className="demo-phone-inner" ref={containerRef}>
          {demos[active].messages.map((msg, i) => (
            <div
              key={`${active}-${i}`}
              className={`bubble ${msg.cls}`}
              style={{ animationDelay: `${i * 0.5}s` }}
            >
              <small>{msg.agent}</small>
              <span dangerouslySetInnerHTML={{ __html: msg.text }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];

  return (
    <>
      <div className="wrap">
        <div className="topbar">
          <div className="logo">
            Macha<LogoCup />
          </div>
          <div className="pills">
            <span>beta &middot; invite only</span>
            <span>made in Bengaluru</span>
          </div>
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <div className="eyebrow">
                <span className="dot" /> your brain&apos;s new operating system
              </div>

              <h1 className="display">
                {t.heroHeadline}
                <span className="sub">
                  Because your brain has 47 tabs open and zero decisions made.
                </span>
              </h1>

              <p className="lede">
                Vent your raw ideas into a voice note. Your{" "}
                <b>council of AI agents </b> does the overthinking for you
                &mdash; debates it, cuts the fluff, picks one action.
                &ldquo;Someday&rdquo; becomes &ldquo;scheduled.&rdquo; You
                just&hellip; <span className="hl">do the thing.</span>
              </p>

              <WaitlistForm id="heroForm" />
              <Link href="/chat" className="try-btn">try it now &rarr;</Link>

              <div className="counter">
                <div className="avatars">
                  <span style={{ background: "#7db88a" }} />
                  <span style={{ background: "#4a7c59" }} />
                  <span style={{ background: "#b5d4a0" }} />
                  <span style={{ background: "#d4a574" }} />
                </div>
                <span>
                  <WaitlistCount /> overthinkers in the queue
                </span>
              </div>

              <div className="scribble">{t.scribble} &nbsp;</div>
            </div>

            {/* Mini phone preview */}
            <div className="hero-phone">
              <div className="hero-phone-inner">
                <div className="bubble me" style={{ animationDelay: "0s" }}>
                  <small>You &middot; 11:47 pm</small>
                  should i text her back or is that desperate
                </div>
                <div className="bubble fomo" style={{ animationDelay: "0.5s" }}>
                  <small>Fomo &middot; overthinker</small>
                  Define &ldquo;desperate.&rdquo; Is it desperate or is it honest?
                  Also&mdash;when did you last reply within 5 mins to literally
                  anyone?
                </div>
                <div className="bubble didi" style={{ animationDelay: "1s" }}>
                  <small>Didi &middot; voice of reason</small>
                  Two options. <b>(a)</b> Reply now, keep it short. <b>(b)</b>{" "}
                  Wait till morning, risk overthinking all night. That&apos;s it.
                </div>
                <div className="bubble boss" style={{ animationDelay: "1.5s" }}>
                  <small>Boss &middot; the decider</small>
                  Ruling: <b>(a)</b>. Send it. Three words max. No re-reading.
                </div>
                <div className="bubble hype" style={{ animationDelay: "2s" }}>
                  <small>Hype &middot; your cheerleader</small>
                  Quest: &ldquo;Brave Little Samosa&rdquo; &mdash; send before you
                  brush your teeth. +40 XP.
                </div>
                <div className="bubble me" style={{ animationDelay: "2.5s" }}>
                  <small>You</small>
                  ok fine. sending.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHAT DEMO */}
      <section className="demo">
        <div className="wrap">
          <div className="demo-grid">
            <ChatDemo />

            <aside className="demo-aside">
              <h3>
                You vent. They <em>triage.</em>
              </h3>
              <p>
                You don&apos;t pick which agent replies &mdash; the session does.
                Each voice has a job: widen the question, cut the noise, make the
                call, make it fun.
              </p>
              <p>
                No lectures. No &ldquo;as an AI.&rdquo; They banter, disagree on
                purpose, and hand you an action before they hand you a feeling.
              </p>
              <p>
                It won&apos;t fix your life. It will fix your{" "}
                <b>Tuesday</b>.
              </p>
              <div className="note">the council has spoken &nbsp;&#10024;</div>

              <div className="how-vertical">
                <h4 className="how-title">
                  Dump &rarr; Deliberate &rarr; <em>Done.</em>
                </h4>
                <div className="how-steps-v">
                  <div className="how-step-v">
                    <span className="step-num">01</span>
                    <div>
                      <b>Dump it</b> &mdash; Type your messiest thought. No
                      structure.
                    </div>
                  </div>
                  <div className="how-step-v">
                    <span className="step-num">02</span>
                    <div>
                      <b>Council deliberates</b> &mdash; Complicate, simplify,
                      decide, gamify. One verdict.
                    </div>
                  </div>
                  <div className="how-step-v">
                    <span className="step-num">03</span>
                    <div>
                      <b>One action</b> &mdash; One clear thing you can do in the
                      next 20 minutes.
                    </div>
                  </div>
                  <div className="how-step-v">
                    <span className="step-num">04</span>
                    <div>
                      <b>Follow through</b> &mdash; Task in Notion. Nudge on
                      WhatsApp. XP &amp; streaks.
                    </div>
                  </div>
                </div>
                <div className="integrations">
                  <div className="integ-chip">
                    <span className="ic">📋</span> Notion
                  </div>
                  <div className="integ-chip">
                    <span className="ic">💬</span> WhatsApp
                  </div>
                  <div className="integ-chip">
                    <span className="ic">🎮</span> XP
                  </div>
                  <div className="integ-chip">
                    <span className="ic">📊</span> Priorities
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section style={{ padding: "0 0 48px" }}>
        <div className="wrap">
          <div className="closing">
            <h2>
              {t.closingHeadline}
            </h2>
            <p>
              Your council turns the spiral into a single tap. One decision, one
              quest, one good night&apos;s sleep.
            </p>
            <WaitlistForm id="closingForm" />
            <Link href="/chat" className="try-btn" style={{ marginTop: 12 }}>try it now &rarr;</Link>
            <div className="meta">
              Invites start Summer 2026 &middot; No spam &middot; Unsubscribe
              anytime
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <footer>
          <div className="logo">
            Macha<LogoCup />
          </div>
          <div>&copy; 2026 &middot; Bengaluru</div>
        </footer>
      </div>

      <div className="toast" id="toast">
        <span className="check" />
        <span id="toastMsg" />
      </div>
    </>
  );
}
