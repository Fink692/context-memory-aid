import { describe, expect, it } from "vitest";
import { mutationErrorMessage } from "./mutation-error";

describe("mutationErrorMessage", () => {
  it("surfaces intentional domain-limit guidance", () => {
    expect(mutationErrorMessage(
      new Error("This memory already has five open follow-ups. Complete or remove one before reopening another."),
      "Try again.",
    )).toContain("five open follow-ups");
  });

  it("does not expose storage or implementation details", () => {
    expect(mutationErrorMessage(new Error("SQLITE_IOERR: /private/path"), "Try again."))
      .toBe("Try again.");
  });
});
