import { test, expect } from "@playwright/test";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { E2E } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import { ensureTestUser } from "./fixtures/seed";
import { ensureOwnerOrg } from "./fixtures/organizations";
import { loginViaUI } from "./fixtures/auth";

/**
 * Session auth hardening regression tests.
 *
 * Covers: protected route redirect preservation, malicious redirect fallback,
 * build artifact security (no sourcemaps, no secrets, no .env files).
 */

// Secret patterns to scan for in dist (mirrors check-build-secrets.sh)
const SECRET_PATTERNS = [
  { label: "SUPABASE_SERVICE_ROLE_KEY", pattern: /SUPABASE_SERVICE_ROLE_KEY/ },
  { label: "MAYAR_API_KEY", pattern: /MAYAR_API_KEY/ },
  { label: "MAYAR_WEBHOOK_TOKEN", pattern: /MAYAR_WEBHOOK_TOKEN/ },
  { label: "SENTRY_AUTH_TOKEN", pattern: /SENTRY_AUTH_TOKEN/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { label: "OpenAI key", pattern: /sk-[A-Za-z0-9]{48,}/ },
  { label: "Private key marker", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
];

const MALICIOUS_REDIRECTS = [
  { label: "javascript scheme", value: "javascript:alert(1)" },
  { label: "data scheme", value: "data:text/html;base64,PHNjcmlwdD4=" },
  { label: "protocol-relative", value: "%2F%2Fevil.com" },
  { label: "off-site https", value: "https://evil.example.com/phish" },
];

if (E2E.isFullLocal) {
  test.describe("Protected Route Redirect", () => {
    test.beforeAll(async () => {
      await ensureTestUser(E2E_OWNER);
      await ensureOwnerOrg();
    });

    test("anonymous visit to /dashboard redirects to login and returns to dashboard after login", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      await loginViaUI(page, E2E_OWNER);
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
      expect(page.url()).toContain("/dashboard");
    });

    for (const { label, value } of MALICIOUS_REDIRECTS) {
      test(`malicious redirect "${label}" falls back to /dashboard after login`, async ({ page }) => {
        await page.goto(`/login?redirect=${value}`);
        await expect(page).toHaveURL(/\/login/);
        await loginViaUI(page, E2E_OWNER);
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        expect(page.url()).toContain("/dashboard");
        expect(page.url()).not.toContain("evil");
        expect(page.url()).not.toContain("javascript:");
        expect(page.url()).not.toContain("data:");
      });
    }
  });

  const distCandidates = [path.resolve("dist"), path.resolve("apps/web/dist")];
  const distDir = distCandidates.find((p) => existsSync(p));

  if (distDir) {
    test.describe("Build Artifact Security", () => {
      test("dist build artifacts contain no source maps", async () => {
        const mapFiles = await findFilesInDir(distDir, ".map");
        expect(mapFiles).toHaveLength(0);
      });

      test("dist build artifacts contain no .env files", async () => {
        const envFiles = await findFilesInDir(distDir, ".env", true);
        expect(envFiles).toHaveLength(0);
      });

      test("dist build artifacts contain no secret patterns", async () => {
        const textFiles = await findTextFiles(distDir);
        expect(textFiles.length).toBeGreaterThan(0);

        const found: Array<{ file: string; label: string }> = [];

        for (const filePath of textFiles) {
          const content = await fs.readFile(filePath, "utf-8");

          for (const { label, pattern } of SECRET_PATTERNS) {
            if (pattern.test(content)) {
              found.push({ file: path.relative(distDir, filePath), label });
            }
          }
        }

        expect(found).toEqual([]);
      });
    });
  }
}

// ── File system helpers ──────────────────────────────────────────────────

async function findFilesInDir(
  dir: string,
  suffix: string,
  exact = false,
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await findFilesInDir(fullPath, suffix, exact);
        results.push(...sub);
      } else {
        if (exact) {
          if (entry.name === suffix || entry.name.startsWith(suffix + ".")) {
            results.push(fullPath);
          }
        } else if (entry.name.endsWith(suffix)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // ignore
  }
  return results;
}

async function findTextFiles(dir: string): Promise<string[]> {
  const TEXT_EXTENSIONS = [".js", ".css", ".html", ".txt", ".json", ".mjs"];
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await findTextFiles(fullPath);
        results.push(...sub);
      } else if (TEXT_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore
  }
  return results;
}
