import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · MachaX",
  description: "What MachaX collects, why, who it is shared with, what is kept after deletion, and how to delete your account.",
};

const CONTACT = "sarvind@gritlabsai.co";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <h1 style={styles.heading}>privacy policy</h1>
        <p style={styles.muted}>Last updated: 28 October 2026</p>

        <p>
          MachaX (the website at machax.xyz and the MachaX Android app) is a group chat where you talk
          with AI characters. This page explains what we collect, why, who we share it with, and how to get it deleted.
        </p>

        <h2 style={styles.h2}>signing in</h2>
        <p>
          You sign in with your Google account, through Firebase Authentication (a Google service). We store the
          Google account&apos;s user id, your name and your email. MachaX has no password of its own, and you need an
          account to use it.
        </p>

        <h2 style={styles.h2}>what we collect</h2>
        <ul>
          <li><b>Your Google sign-in</b>: user id, name and email, as above.</li>
          <li><b>Your chats</b>: the messages you send, the AI replies, and your pod and settings choices.</li>
          <li><b>Technical logs</b> of each chat turn (the prompt, timings, which AI service answered) so we can fix bugs and improve replies.</li>
          <li><b>Credits and purchases</b>: your credit balance, a record of every change to it (free credit, the cost of each message, each top-up or refund), and an order record for each purchase (product, amount, status, date).</li>
          <li><b>Reports</b> you file on AI messages, with the reported text.</li>
          <li><b>App usage (Android app only)</b>: Firebase Analytics and Meta App Events record events such as install, app open, screens viewed, sign-up and first chat, to count usage and measure our ads. These tools may use your device&apos;s advertising ID.</li>
        </ul>
        <p>We do not collect your location, contacts or photos. We don&apos;t show ads in MachaX, and we don&apos;t sell your data.</p>

        <h2 style={styles.h2}>why we use it</h2>
        <ul>
          <li>To run the chat: generate replies, keep your conversation history and settings.</li>
          <li>To sign you in.</li>
          <li>To meter usage: each message uses credit, and top-ups add more.</li>
          <li>To review reported messages and make the AI characters safer.</li>
          <li>To understand how the app is used and whether our ads work.</li>
        </ul>

        <h2 style={styles.h2}>payments</h2>
        <p>
          On the web, top-ups go through <b>Razorpay</b>. In the Android app they go through <b>Google Play</b>, managed
          by <b>RevenueCat</b>. Your card, UPI or bank details go straight to Razorpay or Google; we never see them.
          We get back the order, the amount, and whether it was paid or refunded.
        </p>

        <h2 style={styles.h2}>who we share it with</h2>
        <p>Only the services needed to run MachaX, under their own data-protection terms:</p>
        <ul>
          <li><b>Anthropic</b> (Claude), and <b>Google</b> (Gemini) as a backup: your messages and chat context are sent to generate AI replies and topic summaries.</li>
          <li><b>Google Firebase</b>: sign-in, and app usage on Android.</li>
          <li><b>Meta</b>: app usage events on Android, to measure our ads.</li>
          <li><b>Razorpay</b>, <b>Google Play</b> and <b>RevenueCat</b>: payments, as above.</li>
          <li><b>Klipy</b>: short search phrases (not your messages) to find GIFs and stickers.</li>
          <li><b>Convex</b>: our database, where accounts, chats and credit records are stored.</li>
          <li><b>Vercel</b>: hosts the website and server.</li>
        </ul>
        <p>All data is sent over encrypted connections (HTTPS).</p>

        <h2 style={styles.h2}>how long we keep it</h2>
        <p>We keep your data until you delete your account. Deleting it permanently removes:</p>
        <ul>
          <li>your profile (username, name, email), conversations, messages, settings, reports and chat logs;</li>
          <li>your Google sign-in record in Firebase Authentication.</li>
        </ul>
        <p>
          We keep your credit records and purchase orders after deletion, for our financial records. They hold amounts,
          dates and an anonymous user id, not your name, email or chats. App usage events already sent to Firebase
          Analytics and Meta stay with them under their own retention rules.
        </p>

        <h2 style={styles.h2}>delete your account</h2>
        <p>
          In the app: open <b>configure pod → delete account</b>. On the web: go to{" "}
          <a href="/delete-account" style={styles.link}>machax.xyz/delete-account</a>. Google sometimes asks you to sign in
          again before the sign-in record can be removed; the page tells you if so. If you can&apos;t sign in,
          email <a href={`mailto:${CONTACT}`} style={styles.link}>{CONTACT}</a> from your account&apos;s email address and we will delete it within 30 days.
        </p>

        <h2 style={styles.h2}>reporting AI messages</h2>
        <p>Every AI message has a <b>report</b> button. Reports are reviewed and used to fix the characters.</p>

        <h2 style={styles.h2}>age</h2>
        <p>MachaX is for people aged 13 and over. If you think a child under 13 has an account, contact us and we will delete it.</p>

        <h2 style={styles.h2}>changes and contact</h2>
        <p>
          If this policy changes, we will update the date at the top. Questions:{" "}
          <a href={`mailto:${CONTACT}`} style={styles.link}>{CONTACT}</a>.
        </p>
      </article>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "32px 16px" },
  card: { maxWidth: 680, width: "100%", color: "#1a1e16", fontSize: 15, lineHeight: 1.6 },
  heading: { fontFamily: "var(--font-serif), serif", fontWeight: 700, fontSize: 28, letterSpacing: "-0.5px", margin: "0 0 4px" },
  h2: { fontFamily: "var(--font-serif), serif", fontSize: 18, margin: "28px 0 6px" },
  muted: { color: "#5e6358", fontSize: 13, margin: "0 0 20px" },
  link: { color: "#4a7c59", fontWeight: 600 },
};
