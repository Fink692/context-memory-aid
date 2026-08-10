import { describe, expect, it } from "vitest";
import {
  decidePassportRead,
  demoBrief,
  issueMeetingPass,
  revokeMeetingPass,
} from "./passport-demo";

const issuedAt = new Date("2026-08-11T14:00:00.000Z");

describe("Context Pass demo policy", () => {
  it("never includes the unshareable private note in a pass", () => {
    const pass = issueMeetingPass([
      "relationship-summary",
      "open-commitments",
      "private-notes",
    ], issuedAt);

    expect(pass.allowedFieldIds).toEqual(["relationship-summary", "open-commitments"]);
    expect(pass.excludedFieldIds).toContain("private-notes");
  });

  it("allows only the named recipient to read fields inside scope", () => {
    const pass = issueMeetingPass(["relationship-summary", "meeting-goals"], issuedAt);

    const allowedDecision = decidePassportRead({
      pass,
      recipient: "Meeting Copilot",
      requestedFieldIds: ["relationship-summary", "meeting-goals"],
      now: new Date("2026-08-11T14:10:00.000Z"),
    });

    expect(allowedDecision).toMatchObject({
      allowed: true,
      fieldIds: ["relationship-summary", "meeting-goals"],
      receipt: {
        recipient: "Meeting Copilot",
        purpose: "Prepare for thesis check-in",
        fieldIds: ["relationship-summary", "meeting-goals"],
        readAt: "2026-08-11T14:10:00.000Z",
        expiresAt: "2026-08-11T14:30:00.000Z",
        writeBack: "review-required",
      },
    });

    expect(decidePassportRead({
      pass,
      recipient: "Unknown App",
      requestedFieldIds: ["relationship-summary"],
      now: new Date("2026-08-11T14:10:00.000Z"),
    })).toEqual({ allowed: false, reason: "wrong-recipient" });
  });

  it("denies fields outside scope, expired passes, and revoked passes", () => {
    const pass = issueMeetingPass(["relationship-summary"], issuedAt);

    expect(decidePassportRead({
      pass,
      recipient: "Meeting Copilot",
      requestedFieldIds: ["open-commitments"],
      now: new Date("2026-08-11T14:10:00.000Z"),
    })).toEqual({ allowed: false, reason: "outside-scope" });

    expect(decidePassportRead({
      pass,
      recipient: "Meeting Copilot",
      requestedFieldIds: ["relationship-summary"],
      now: new Date("2026-08-11T14:30:00.000Z"),
    })).toEqual({ allowed: false, reason: "expired" });

    expect(decidePassportRead({
      pass: revokeMeetingPass(pass),
      recipient: "Meeting Copilot",
      requestedFieldIds: ["relationship-summary"],
      now: new Date("2026-08-11T14:05:00.000Z"),
    })).toEqual({ allowed: false, reason: "revoked" });
  });

  it("builds the brief only from approved fields", () => {
    const brief = demoBrief(["meeting-goals"]);

    expect(brief).toEqual(["Aim to agree on the interview sample and next milestone."]);
    expect(brief.join(" ")).not.toContain("promised");
  });
});
