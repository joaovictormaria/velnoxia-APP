import { execSync } from "child_process";

console.log("🔍 Verificando migrations aplicadas...\n");

try {
  const result = execSync("npx prisma migrate status", {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(result);
} catch (err: any) {
  console.log(err.stdout || err.message);
}
