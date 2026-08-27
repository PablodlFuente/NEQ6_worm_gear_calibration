import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aiScraperMiddleware } from "./tools/ai-scraper.js";

function localAuditLog() {
  const logDir = resolve(process.cwd(), "logs");
  let writeQueue = Promise.resolve();
  return {
    name: "neq6-local-audit-log",
    configureServer(server) {
      server.middlewares.use(aiScraperMiddleware());
      server.middlewares.use("/api/audit", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          if (body.length < 64_000) body += chunk;
        });
        request.on("end", () => {
          try {
            const received = JSON.parse(body || "{}");
            const now = new Date();
            const record = {
              serverTimestamp: now.toISOString(),
              clientIp: request.socket.remoteAddress || null,
              userAgent: request.headers["user-agent"] || null,
              ...received,
            };
            const file = resolve(logDir, `${now.toISOString().slice(0, 10)}.jsonl`);
            writeQueue = writeQueue
              .then(() => mkdir(logDir, { recursive: true }))
              .then(() => appendFile(file, `${JSON.stringify(record)}\n`, "utf8"))
              .catch((error) => console.error("No se pudo escribir el audit log", error));
            response.statusCode = 204;
          } catch {
            response.statusCode = 400;
          }
          response.end();
        });
      });
      server.middlewares.use("/docs/SkyWatcher_EQ6_Protocolo_investigacion.pdf", async (_request, response) => {
        try {
          response.setHeader("Content-Type", "application/pdf");
          response.end(await readFile(resolve(process.cwd(), "docs", "SkyWatcher_EQ6_Protocolo_investigacion.pdf")));
        } catch { response.statusCode = 404; response.end(); }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localAuditLog()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ["**/logs/**", "**/docs/docs_dev/**", "**/.tools/**"],
    },
    hmr: {
      port: 3000,
    },
  },
});
