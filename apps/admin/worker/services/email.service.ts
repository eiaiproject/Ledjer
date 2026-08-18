// Minimal transactional email sender — same provider contract as the main
// worker (Resend-compatible Bearer-token API).
const API_URL = "https://api.resend.com/emails";
const FROM = "Ledjer <noreply@ledjer.id>";

function stripHtmlTags(html: string): string {
  let result = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") { inTag = true; continue; }
    if (ch === ">") { inTag = false; continue; }
    if (!inTag) result += ch;
  }
  return result;
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
