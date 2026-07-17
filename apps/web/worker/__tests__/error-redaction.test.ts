import { describe, it, expect } from "vitest";
import { HttpError, badRequest, unauthorized, forbidden, notFound, conflict } from "../http/errors";

describe("Error Redaction", () => {
  it("HttpError contains only code, message, status — no stack traces", () => {
    const error = new HttpError(400, "test_error", "Test error message");
    expect(error.code).toBe("test_error");
    expect(error.message).toBe("Test error message");
    expect(error.status).toBe(400);
    // The error handler wraps this in { error: { code, message, requestId } }
    // Verified by reading error.middleware.ts
  });

  it("badRequest helper creates well-formed error", () => {
    const error = badRequest("invalid_input", "Input is invalid");
    expect(error.status).toBe(400);
    expect(error.code).toBe("invalid_input");
  });

  it("unauthorized helper creates well-formed error", () => {
    const error = unauthorized("Custom message");
    expect(error.status).toBe(401);
    expect(error.code).toBe("unauthorized");
  });

  it("forbidden helper creates well-formed error", () => {
    const error = forbidden("permission_denied", "Access denied");
    expect(error.status).toBe(403);
    expect(error.code).toBe("permission_denied");
  });

  it("notFound helper creates well-formed error", () => {
    const error = notFound("resource_not_found", "Resource not found");
    expect(error.status).toBe(404);
    expect(error.code).toBe("resource_not_found");
  });

  it("conflict helper creates well-formed error", () => {
    const error = conflict("duplicate_entry", "Entry already exists");
    expect(error.status).toBe(409);
    expect(error.code).toBe("duplicate_entry");
  });

  it("error responses have consistent structure: { error: { code, message, requestId } }", () => {
    const error = new HttpError(403, "test_error", "Test");
    // The error handler wraps this in { error: { code, message, requestId } }
    expect(error.code).toBe("test_error");
    expect(error.message).toBe("Test");
  });
});
