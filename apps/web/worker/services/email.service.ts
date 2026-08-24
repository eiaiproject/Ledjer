// ponytail: Minimal transactional email sender using generic HTTP API.
// Supports any provider that accepts Bearer-token auth + JSON body
// (Resend, Mailgun v3 API, Postmark, etc.). Defaults to Resend format.
// Upgrade: templating, batch send, delivery tracking — when needed.

const API_URL = "https://api.resend.com/emails";
const FROM = "Ledjer <noreply@ledjer.id>";

/** Strip HTML tags — negated class avoids backtracking (no ReDoS). */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  apiKey: string,
  input: SendEmailInput,
  from?: string,
): Promise<void> {
  if (!apiKey) {
    console.warn("EMAIL_API_KEY not set — skipping email send", { to: input.to, subject: input.subject });
    return;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtmlTags(input.html),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Email send failed (${res.status}): ${body}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Email service unreachable", { cause: err });
    }
    throw err;
  }
}
