#!/usr/bin/env node
/*
 * Capture your AI coding session transcripts into .claude-logs/ as readable
 * markdown, so they can be committed with your submission. This is part of the
 * assignment: we read how you worked with your AI tools.
 *
 * Captures only sessions for THIS repository — the assignment folder and any of
 * its git worktrees (so parallel agents are included), and nothing from your
 * other projects. A session is matched by the working directory recorded in its
 * transcript: it counts if that directory is this folder, or a git worktree of
 * the same repository.
 *
 *   - Claude Code: all matching transcripts (incl. subagent sessions).
 *   - Codex CLI:   all matching sessions.
 *
 * Run it any time, and again right before you submit:
 *   pnpm logs:capture        (or: node scripts/capture-logs.mjs)
 *
 * Claude Code also runs this automatically when a session ends (SessionEnd hook
 * in .claude/settings.json). Then commit the folder:
 *   git add .claude-logs && git commit -m "session logs"
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const OUT = join(process.cwd(), '.claude-logs');
// Loose bound so we don't scan ancient history; repo-matching does the real
// filtering. An assignment session is always far more recent than this.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const now = Date.now();

function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---- "is this session part of this repository?" ----
const repoCache = new Map();
function gitCommonDir(dir) {
  if (repoCache.has(dir)) return repoCache.get(dir);
  let result = null;
  try {
    const out = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    result = out ? realpathSync(out) : null;
  } catch {
    result = null;
  }
  repoCache.set(dir, result);
  return result;
}

const HERE = realpathSync(process.cwd());
const THIS_REPO = gitCommonDir(HERE); // shared .git of this repo + its worktrees, or null

function belongsToThisRepo(sessionCwd) {
  if (!sessionCwd || !existsSync(sessionCwd)) return false;
  let real;
  try {
    real = realpathSync(sessionCwd);
  } catch {
    return false;
  }
  if (real === HERE) return true;
  if (!THIS_REPO) return false; // not a git repo yet → only exact-folder match
  return gitCommonDir(real) === THIS_REPO;
}

function cwdOf(raw) {
  const m = raw.match(/"cwd"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

// A lone opening tag on the first line (e.g. "<environment_context>") marks an
// auto-injected context block, not a real prompt.
function isInjected(text) {
  return /^<[a-z][a-z0-9_-]*>\s*$/m.test(text.split('\n')[0].trim());
}

function textFromContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object') return b.text ?? b.input_text ?? '';
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function renderTranscript(title, sessionId, source, turns) {
  const date = turns.find((t) => t.time)?.time ?? '';
  const lines = [];
  lines.push(`# ${title} — ${fmtDate(date)}`);
  lines.push('');
  lines.push(`- **Session:** \`${sessionId}\``);
  lines.push(`- **Source:** \`${source}\``);
  lines.push(`- **Exchanges:** ${turns.filter((t) => t.role === 'user').length}`);
  lines.push('');
  lines.push('---');
  for (const t of turns) {
    const who = t.role === 'user' ? '🧑 User' : '🤖 Assistant';
    const when = t.time ? ` — ${fmtTime(t.time)}` : '';
    lines.push('');
    lines.push(`## ${who}${when}`);
    lines.push('');
    lines.push(t.text);
  }
  lines.push('');
  return lines.join('\n');
}

// ---- Claude Code: ~/.claude/projects/*/*.jsonl ----
function isUserPrompt(e) {
  if (e?.type !== 'user' || e.isMeta || e.isSidechain) return false;
  const c = e.message?.content;
  if (typeof c !== 'string' || !c.trim()) return false;
  if (isInjected(c)) return false;
  return !/^(<command-name>|<local-command|Caveat:)/.test(c);
}

function parseClaude(raw) {
  const turns = [];
  let pendingAssistant = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const time = typeof e.timestamp === 'string' ? e.timestamp : '';
    if (isUserPrompt(e)) {
      if (pendingAssistant) {
        turns.push(pendingAssistant);
        pendingAssistant = null;
      }
      turns.push({ role: 'user', text: e.message.content.trim(), time });
    } else if (e?.type === 'assistant' && !e.isSidechain) {
      const text = textFromContent(e.message?.content);
      if (text) pendingAssistant = { role: 'assistant', text, time };
    }
  }
  if (pendingAssistant) turns.push(pendingAssistant);
  return turns;
}

function captureClaude() {
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return 0;
  ensure(OUT);
  let n = 0;
  for (const proj of readdirSync(root)) {
    const pdir = join(root, proj);
    let ps;
    try {
      ps = statSync(pdir);
    } catch {
      continue;
    }
    if (!ps.isDirectory()) continue;
    for (const name of readdirSync(pdir)) {
      if (!name.endsWith('.jsonl')) continue;
      const fp = join(pdir, name);
      let fs;
      try {
        fs = statSync(fp);
      } catch {
        continue;
      }
      if (now - fs.mtimeMs > WINDOW_MS) continue;
      const raw = readFileSync(fp, 'utf8');
      if (!belongsToThisRepo(cwdOf(raw))) continue;
      const turns = parseClaude(raw);
      if (turns.length === 0) continue;
      const id = name.replace(/\.jsonl$/, '');
      const title = name.startsWith('agent-') ? 'Claude Code Subagent Session' : 'Claude Code Session';
      writeFileSync(join(OUT, `claude_${id}.md`), renderTranscript(title, id, fp.replace(homedir(), '~'), turns));
      n++;
    }
  }
  return n;
}

// ---- Codex CLI: ~/.codex/sessions/**/rollout-*.jsonl ----
function parseCodex(raw) {
  const turns = [];
  let sessionId = 'unknown';
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === 'session_meta' && e.payload?.id) sessionId = e.payload.id;
    if (e.type === 'response_item' && e.payload?.type === 'message') {
      const role = e.payload.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const text = textFromContent(e.payload.content);
      if (!text || (role === 'user' && isInjected(text))) continue;
      turns.push({ role, text, time: typeof e.timestamp === 'string' ? e.timestamp : '' });
    }
  }
  return { sessionId, turns };
}

function captureCodex() {
  const root = join(homedir(), '.codex', 'sessions');
  if (!existsSync(root)) return 0;
  ensure(OUT);
  let n = 0;
  const walk = (dir, depth = 0) => {
    if (depth > 5) return;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(p, depth + 1);
      else if (name.endsWith('.jsonl') && now - s.mtimeMs <= WINDOW_MS) {
        const raw = readFileSync(p, 'utf8');
        if (!belongsToThisRepo(cwdOf(raw))) continue;
        const { sessionId, turns } = parseCodex(raw);
        if (turns.length === 0) continue;
        writeFileSync(join(OUT, `codex_${sessionId}.md`), renderTranscript('Codex Session', sessionId, p.replace(homedir(), '~'), turns));
        n++;
      }
    }
  };
  walk(root);
  return n;
}

ensure(OUT);
const claude = captureClaude();
const codex = captureCodex();

console.log('\n.claude-logs updated (markdown transcripts for this repository):');
console.log(`  Claude Code sessions:   ${claude}`);
console.log(`  Codex sessions:         ${codex}`);
if (claude === 0 && codex === 0) {
  console.log(
    '\nNo sessions found for this folder (or its git worktrees). Make sure you run\n' +
      'this from the assignment root, after using Claude Code or Codex here. If your\n' +
      'tool stores logs elsewhere, export the transcript into .claude-logs/ manually.',
  );
} else {
  console.log('\nCommit the folder before you submit:  git add .claude-logs && git commit -m "session logs"');
}
console.log('');
