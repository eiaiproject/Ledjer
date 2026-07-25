import { describe, it, expect } from "vitest";

// stripHtmlTags is a private function; test its behavior via sendEmail's text fallback
describe("Email Service", () => {
  describe("sendEmail", () => {
    it("skips sending when API key is empty", async () => {
      const { sendEmail } = await import("./email.service");
      // Should not throw when apiKey is empty
      await expect(
        sendEmail("", { to: "test@example.com", subject: "Test", html: "<p>Hi</p>" }),
      ).resolves.toBeUndefined();
    });

    it("skips sending when API key is not set", async () => {
      const { sendEmail } = await import("./email.service");
      await expect(
        sendEmail("", { to: "test@example.com", subject: "Test", html: "<p>Hi</p>" }, "noreply@test.com"),
      ).resolves.toBeUndefined();
    });

    it("throws when API returns non-ok status", async () => {
      const { sendEmail } = await import("./email.service");

      // Mock fetch to return 400
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response("Bad Request", { status: 400 });

      await expect(
        sendEmail("test-api-key", { to: "test@example.com", subject: "Test", html: "<p>Hi</p>" }),
      ).rejects.toThrow("Email send failed (400)");

      globalThis.fetch = originalFetch;
    });
  });

  describe("stripHtmlTags (via text fallback)", () => {
    it("strips HTML tags for plain text version", async () => {
      const { sendEmail } = await import("./email.service");

      let sentBody: string | undefined;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        sentBody = (options as RequestInit).body as string;
        return new Response("OK", { status: 200 });
      };

      await sendEmail("test-api-key", {
        to: "test@example.com",
        subject: "Test",
        html: "<h1>Hello</h1><p>World</p>",
      });

      expect(sentBody).toBeDefined();
      const parsed = JSON.parse(sentBody!);
      expect(parsed.html).toBe("<h1>Hello</h1><p>World</p>");
      // text should be stripped version
      expect(parsed.text).toBe("HelloWorld");

      globalThis.fetch = originalFetch;
    });
  });
});
