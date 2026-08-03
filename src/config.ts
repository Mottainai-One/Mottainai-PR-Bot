import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ override: true });

const asNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const loadPrivateKey = (): string => {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  if (process.env.PRIVATE_KEY_PATH) {
    try {
      return fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");
    } catch (err) {
      console.error(`Nao foi possivel ler PRIVATE_KEY_PATH: ${(err as Error).message}`);
    }
  }
  return "";
};


export const config = {
  appId: asNumber(process.env.APP_ID, 0),
  privateKey: loadPrivateKey(),
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  org: process.env.GITHUB_ORG || "Mottainai-One",
  minApprovals: asNumber(process.env.MIN_APPROVALS, 2),
  ignoredRepos: (process.env.IGNORED_REPOS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean),
  protectedBranches: (process.env.PROTECTED_BRANCHES || "main,develop")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean),
  prBaseBranch: process.env.PR_BASE_BRANCH || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  port: asNumber(process.env.PORT, 3000),
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  webhookProxyUrl: process.env.WEBHOOK_PROXY_URL || "",
};

export function hasRequiredConfig(): string[] {
  const missing: string[] = [];
  if (!config.appId) missing.push("APP_ID");
  if (!config.privateKey) missing.push("PRIVATE_KEY");
  if (!config.webhookSecret) missing.push("WEBHOOK_SECRET");
  if (!config.geminiApiKey) missing.push("GEMINI_API_KEY");
  return missing;
}
