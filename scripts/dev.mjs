import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3000";
const smeeUrl = process.env.SMEE_URL;

if (!smeeUrl) {
  console.error("Defina SMEE_URL no .env (ex: SMEE_URL=https://smee.io/SEU-CANAL).");
  console.error("Crie o canal em https://smee.io/new e copie a URL.");
  process.exit(1);
}

const nodeBin = process.platform === "win32" ? "node.exe" : "node";
const smeeBin = path.join(root, "node_modules", "smee-client", "bin", "smee.js");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const webhookPath = process.env.WEBHOOK_PATH || "/api/github/webhooks";
const target = `http://localhost:${port}${webhookPath}`;

const children = [];
const run = (name, args) => {
  const child = spawn(nodeBin, args, { cwd: root, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${name}] encerrou com codigo ${code}`);
      children.forEach((c) => c.kill());
      process.exit(code);
    }
  });
  return child;
};

console.log("==============================================");
console.log(`Smee: ${smeeUrl}`);
console.log(`  -> ${target}`);
console.log(`Bot: http://localhost:${port}${webhookPath}`);
console.log("==============================================");

run("smee", [smeeBin, "--url", smeeUrl, "--port", port, "--path", webhookPath]);
run("bot", [tsxCli, "watch", "src/server.ts"]);

const shutdown = () => {
  children.forEach((c) => c.kill());
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
