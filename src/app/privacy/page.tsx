import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · MachaX",
  description: "What MachaX collects, why, who it is shared with, and how to delete your account.",
};

const CONTACT = "sarvind@gritlabsai.co";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <h1 style={styles.heading}>privacy policy</h1>
        <p style={styles.muted}>Last updated: 25 October 2026</p>

        <p>
          MachaX (the website at machax.xyz and the MachaX Android app) is a group chat where you talk
          with AI characters. This page explains what we collect, why, and how to get it deleted.
        </p>

        <h2 style={styles.h2}>what we collect</h2>
        <ul>
          <li><b>Account details</b> you give at sign-up: username, email, password (stored hashed, never in plain text), and optionally name, city and age.</li>
          <li><b>Your chats</b>: the messages you send, the AI replies, and your pod and settings choices.</li>
          <li><b>Technical logs</b> of each chat turn (the prompt, timings, which AI service answered) so we can fix bugs and improve replies.</li>
          <li><b>Reports</b> you file on AI messages, with the reported text.</li>
          <li>If you use the app without an account, a random visitor ID stored on your device.</li>
        </ul>
        <p>We do not collect your location, contacts, photos, or device identifiers. We don&apos;t show ads, and we don&apos;t sell your data.</p>

        <h2 style={styles.h2}>why we use it</h2>
        <ul>
          <li>To run the chat: generate replies, keep your conversation history and settings.</li>
          <li>To sign you in and reset your password by email.</li>
          <li>To review reported messages and make the AI characters safer.</li>
        </ul>

        <h2 style={styles.h2}>who we share it with</h2>
        <p>Only the services needed to run MachaX, under their own data-protection terms:</p>
        <ul>
          <li><b>Anthropic</b> (Claude) and <b>Google</b> (Gemini): your messages and chat context are sent to generate AI replies and topic summaries.</li>
          <li><b>Klipy</b>: short search phrases (not your messages) to find GIFs and stickers.</li>
          <li><b>Convex</b>: our database, where accounts and chats are stored.</li>
          <li><b>Vercel</b>: hosts the website and server.</li>
          <li><b>Resend</b>: sends password-reset emails to your email address.</li>
        </ul>
        <p>All data is sent over encrypted connections (HTTPS).</p>

        <h2 style={styles.h2}>how long we keep it</h2>
        <p>We keep your account and chats until you delete your account. Deleting it permanently removes your account, conversations, messages, settings, reports and chat logs.</p>

        <h2 style={styles.h2}>delete your account</h2>
        <p>
          In the app: open <b>configure pod → delete account</b>. On the web: go to{" "}
          <a href="/delete-account" style={styles.link}>machax.xyz/delete-account</a>. If you can&apos;t sign in,
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
