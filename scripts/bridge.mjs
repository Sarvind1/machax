import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const SHARED_SECRET = process.env.BRIDGE_SECRET ?? "";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 120_000);

if (!SHARED_SECRET) {
  console.warn(
    "[bridge] WARNING: BRIDGE_SECRET is not set. Requests will be rejected. " +
      "Set it in both .env.local and Vercel env.",
  );
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (c) => {
      bytes += c.length;
      if (bytes > 1_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runClaude({ prompt, systemPrompt, model }) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json"];
    if (model) args.push("--model", model);
    if (systemPrompt) args.push("--system-prompt", systemPrompt);

    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: undefined, // don't leak if set
      },
    });

    // Write prompt to stdin (avoids shell escaping issues)
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude CLI timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`failed to parse claude output: ${e.message}`));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-headers", "content-type, x-bridge-secret");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    json(res, 200, { ok: true, hasSecret: Boolean(SHARED_SECRET) });
    return;
  }

  if (req.url !== "/chat" || req.method !== "POST") {
    json(res, 404, { error: "not found" });
    return;
  }

  const provided = req.headers["x-bridge-secret"];
  if (!SHARED_SECRET || provided !== SHARED_SECRET) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  const requestId = randomUUID();
  try {
    const raw = await readBody(req);
    const { prompt, systemPrompt, model } = JSON.parse(raw || "{}");
    if (typeof prompt !== "string" || prompt.length === 0) {
      json(res, 400, { error: "prompt (string) required" });
      return;
    }

    console.log(`[${requestId}] claude -p (${prompt.length} chars)${model ? ` model=${model}` : ""}`);
    const started = Date.now();
    const result = await runClaude({ prompt, systemPrompt, model });
    console.log(`[${requestId}] ok in ${Date.now() - started}ms`);

    json(res, 200, {
      text: result.result ?? "",
      sessionId: result.session_id,
      durationMs: result.duration_ms,
      costUsd: result.total_cost_usd,
    });
  } catch (err) {
    console.error(`[${requestId}] error:`, err.message);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[bridge] listening on http://localhost:${PORT}`);
  console.log(`[bridge] POST /chat  { prompt, systemPrompt?, model? }  header: x-bridge-secret`);
});
