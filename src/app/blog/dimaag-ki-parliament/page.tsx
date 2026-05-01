import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dimaag Ki Parliament: Because Your Brain's MPs Never Agree — MachaX",
  description:
    "Your brain runs a full parliament session every night at 3am. MachaX gives it a speaker, an agenda, and an actual verdict. Ab decision lena easy hai.",
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

export default function DimaagKiParliamentPost() {
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
          Dimaag Ki Parliament: Because Your Brain&rsquo;s MPs Never Agree
        </h1>

        <div
          style={{
            fontSize: 17,
            lineHeight: 1.7,
            color: "var(--ink)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 28 }}>
            Raat ke 3 baj rahe hain. Neend nahi aa rahi. Aur tumhara dimaag chal
            raha hai full Lok Sabha session&mdash;sab ek saath chilla rahe hain,
            koi speaker nahi hai, aur adjournment ka toh sawaal hi nahi.
          </p>

          <p>
            &ldquo;Job chhod du?&rdquo; &ldquo;Nahi yaar, market kharab hai.&rdquo;
            &ldquo;But ye kaam toh soul-crushing hai.&rdquo; &ldquo;Par EMI kaun
            bharega?&rdquo; &ldquo;Freelance try kar le.&rdquo; &ldquo;Freelance
            mein stability kahan?&rdquo;
          </p>

          <p>
            Yahi loop chalta rehta hai. No resolution. No vote. Just vibes and
            existential dread.
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
            Tumhara dimaag ek parliament hai (without a speaker)
          </h2>

          <p>
            Socho toh&mdash;jab bhi koi decision lena hota hai, tumhare andar
            4&ndash;5 alag voices chal rahi hoti hain. Ek dar raha hai, ek
            practical ban raha hai, ek YOLO bol raha hai, aur ek corner mein
            baitha hua hai going &ldquo;kya farak padta hai, sab moh maya
            hai.&rdquo;
          </p>

          <p>
            Problem ye nahi hai ki tum overthink karte ho. Problem ye hai ki in
            sab ka koi moderator nahi hai. Koi order nahi. Koi final vote nahi.
            Bas chaos.
          </p>

          <p>
            Real parliament mein at least ek speaker hota hai jo bolta hai
            &ldquo;ORDER ORDER!&rdquo; Tumhare dimaag mein? Anarchy.
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
            MachaX: tumhare dimaag ka speaker
          </h2>

          <p>
            MachaX mein 4 AI agents hain&mdash;har ek ka ek specific role hai.
            Ye sab milke tumhari soch pe debate karte hain, lekin structured
            tarike se:
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
              <strong>Fomo</strong> &mdash; ye wo dost hai jo uncomfortable
              question poochta hai. &ldquo;Tu job se bhaag raha hai ya kuch naya
              chase kar raha hai? Honest bol.&rdquo;
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--matcha-foam)",
                fontSize: 15,
              }}
            >
              <strong>Didi</strong> &mdash; practical wali voice. &ldquo;Sun,
              tere paas teen options hain. Baith, likh, aur choose kar.&rdquo;
              No drama, just clarity.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--boss)",
                fontSize: 15,
              }}
            >
              <strong>Boss</strong> &mdash; ye sab sunke final call leta hai.
              &ldquo;Option 2. Kal subah pehli cheez ye kar. Done.&rdquo; Koi
              hedging nahi, koi &ldquo;it depends&rdquo; nahi.
            </div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--hype)",
                fontSize: 15,
              }}
            >
              <strong>Hype</strong> &mdash; cheerleader. Boss ki decision ko ek
              quest bana deta hai. XP milta hai, streak banti hai, aur quest ka
              naam hota hai kuch aisa &ldquo;Brave Little Samosa&rdquo; ya
              &ldquo;The Jugaad Express.&rdquo;
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
            Kaam kaise karta hai
          </h2>

          <p>
            Bahut simple. Apna messy thought type karo&mdash;Hindi mein, English
            mein, Hinglish mein, whatever. Agents debate karte hain. Tum ek
            clear action lete ho. 3 minute mein.
          </p>

          <p>
            Wo decision jispe tum 2 hafton se soch rahe the? 3 minute. Seriously.
          </p>

          <p>
            Aur nahi, ye therapy nahi hai. Agar serious mental health issues hain
            toh please professional se baat karo. MachaX hai everyday decision
            paralysis ke liye&mdash;&ldquo;ye job lu ya wo,&rdquo; &ldquo;baat
            karu ya nahi,&rdquo; &ldquo;ye phone lena chahiye ya budget
            overshoot ho jayega.&rdquo;
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
            Bangalore se, overthinkers ke liye
          </h2>

          <p>
            MachaX Bangalore se bana hai. Ek overthinker ne banaya hai, baaki
            overthinkers ke liye. If that&rsquo;s you&mdash;if you&rsquo;re that
            person jo raat ko ceiling ko ghoorte hue decisions ke baare mein
            sochta hai&mdash;try it.
          </p>

          <p>
            Apna thought dump karo. Parliament ko argue karne do. Ek action lo.
            So jao.
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
            order order! the council has spoken.
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
            Dimaag ki parliament chalu hai?
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
            Thought dump karo. Agents debate karenge. Ek clear action milega.
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
