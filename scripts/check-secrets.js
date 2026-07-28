#!/usr/bin/env node
// pre-commit フック用: ステージ済みの変更に .env ファイルや秘密情報らしき文字列が
// 含まれていないかをチェックし、見つかった場合はコミットを中止する。
import { execSync } from "node:child_process";

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" });
}

const ENV_FILE_RE = /(^|\/)\.env(\..+)?$/;
const ENV_ALLOWLIST = new Set([".env.example", ".env.sample"]);

const SECRET_PATTERNS = [
  { name: "Anthropic APIキー", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI APIキー", re: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: "Google APIキー", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Google認証トークン", re: /\bAQ\.[A-Za-z0-9_-]{20,}/ },
  { name: "AWSアクセスキーID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHubトークン", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slackトークン", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "秘密鍵ブロック", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "汎用シークレット代入", re: /(API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*['"][A-Za-z0-9\-_/+]{16,}['"]/i },
];

let hasError = false;

const stagedFiles = git("diff --cached --name-only --diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);

for (const file of stagedFiles) {
  const base = file.split("/").pop();
  if (ENV_FILE_RE.test(file) && !ENV_ALLOWLIST.has(base)) {
    console.error(`✖ ${file} はコミットできません(.envファイルは秘密情報を含む可能性があります)`);
    hasError = true;
  }
}

const diff = git("diff --cached -U0 --diff-filter=ACMR");
let currentFile = null;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice("+++ b/".length);
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(line)) {
      console.error(`✖ ${currentFile}: ${name} らしき文字列が見つかりました`);
      hasError = true;
    }
  }
}

if (hasError) {
  console.error("\nコミットを中止しました。秘密情報を誤ってコミットしていないか確認してください。");
  console.error("誤検知の場合は `git commit --no-verify` で回避できますが、内容を必ず確認してください。");
  process.exit(1);
}
