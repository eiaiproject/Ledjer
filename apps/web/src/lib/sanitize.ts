/**
 * Input sanitization utilities
 * Prevents XSS and injection attacks
 */

/**
 * Sanitize string input - removes HTML tags and trims
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[<>]/g, "") // Remove angle brackets
    .trim();
}

/**
 * Sanitize numeric input - only allows digits, decimal, negative
 */
export function sanitizeNumber(input: string): string {
  return input.replace(/[^\d.-]/g, "");
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Indonesian phone number format
 */
export function isValidPhone(phone: string): boolean {
  // Indonesian phone: starts with 08, +62, or 62
  const phoneRegex = /^(\+?62|0)8[1-9][0-9]{7,11}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ""));
}

/**
 * Validate strong password
 * - At least 8 characters
 * - At least 1 uppercase
 * - At least 1 lowercase
 * - At least 1 number
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Get password strength score (0-4)
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  // Cap at 4
  score = Math.min(score, 4);

  const levels = [
    { label: "Sangat Lemah", color: "error" },
    { label: "Lemah", color: "error" },
    { label: "Sedang", color: "warning" },
    { label: "Kuat", color: "success" },
    { label: "Sangat Kuat", color: "success" },
  ];

  return { score, ...levels[score] };
}

/**
 * Escape HTML entities
 */
export function escapeHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Sanitize file name - removes path traversal attempts
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace invalid chars
    .replace(/\.{2,}/g, ".") // Remove multiple dots
    .replace(/^\.+/, ""); // Remove leading dots
}

/**
 * Validate date string (YYYY-MM-DD)
 */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const date = new Date(dateStr);
  const [year, month, day] = dateStr.split("-").map(Number);

  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

/**
 * Validate Indonesian business numbers
 */
export function isValidNPWP(npwp: string): boolean {
  // NPWP: 15 digits, often formatted as XX.XXX.XXX.X-XXX.XXX
  const cleaned = npwp.replace(/[.\-\s]/g, "");
  return /^\d{15}$/.test(cleaned);
}

export function isValidNIK(nik: string): boolean {
  // NIK: 16 digits
  return /^\d{16}$/.test(nik);
}
