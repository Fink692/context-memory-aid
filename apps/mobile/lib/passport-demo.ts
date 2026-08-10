export type PassportFieldId =
  | "relationship-summary"
  | "open-commitments"
  | "meeting-goals"
  | "private-notes";

export type PassportField = {
  id: PassportFieldId;
  label: string;
  preview: string;
  shareable: boolean;
  sensitivity: "standard" | "sensitive";
};

export type MeetingPassStatus = "active" | "revoked";

export type MeetingPass = {
  id: string;
  recipient: "Meeting Copilot";
  purpose: string;
  person: string;
  allowedFieldIds: PassportFieldId[];
  excludedFieldIds: PassportFieldId[];
  issuedAt: string;
  expiresAt: string;
  status: MeetingPassStatus;
  writeBack: "review-required";
};

export type AccessReceipt = {
  id: string;
  passId: string;
  recipient: MeetingPass["recipient"];
  purpose: string;
  fieldIds: PassportFieldId[];
  readAt: string;
  expiresAt: string;
  writeBack: MeetingPass["writeBack"];
};

export type AccessDecision =
  | { allowed: true; fieldIds: PassportFieldId[]; receipt: AccessReceipt }
  | { allowed: false; reason: "revoked" | "expired" | "wrong-recipient" | "outside-scope" };

export const demoMeeting = {
  person: "Professor Maya Chen",
  role: "Thesis supervisor",
  startsAtLabel: "Tomorrow · 10:00 AM",
  location: "Faculty office · Room 304",
  purpose: "Prepare for thesis check-in",
} as const;

export const passportFields: PassportField[] = [
  {
    id: "relationship-summary",
    label: "Relationship summary",
    preview: "Supervises my accessibility-focused design thesis.",
    shareable: true,
    sensitivity: "standard",
  },
  {
    id: "open-commitments",
    label: "Open commitments",
    preview: "Send revised research question before Friday.",
    shareable: true,
    sensitivity: "standard",
  },
  {
    id: "meeting-goals",
    label: "Meeting goals",
    preview: "Agree on the interview sample and next milestone.",
    shareable: true,
    sensitivity: "standard",
  },
  {
    id: "private-notes",
    label: "Private notes",
    preview: "Personal reflection — stays only in Context.",
    shareable: false,
    sensitivity: "sensitive",
  },
];

const passDurationMs = 30 * 60 * 1000;

export function issueMeetingPass(
  selectedFieldIds: PassportFieldId[],
  issuedAt = new Date(),
): MeetingPass {
  const allowedFieldIds = passportFields
    .filter((field) => field.shareable && selectedFieldIds.includes(field.id))
    .map((field) => field.id);
  const excludedFieldIds = passportFields
    .filter((field) => !allowedFieldIds.includes(field.id))
    .map((field) => field.id);

  return {
    id: `meeting-pass-${issuedAt.getTime()}`,
    recipient: "Meeting Copilot",
    purpose: demoMeeting.purpose,
    person: demoMeeting.person,
    allowedFieldIds,
    excludedFieldIds,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + passDurationMs).toISOString(),
    status: "active",
    writeBack: "review-required",
  };
}

export function revokeMeetingPass(pass: MeetingPass): MeetingPass {
  return { ...pass, status: "revoked" };
}

export function decidePassportRead({
  pass,
  recipient,
  requestedFieldIds,
  now = new Date(),
}: {
  pass: MeetingPass;
  recipient: string;
  requestedFieldIds: PassportFieldId[];
  now?: Date;
}): AccessDecision {
  if (pass.status === "revoked") return { allowed: false, reason: "revoked" };
  if (now.getTime() >= new Date(pass.expiresAt).getTime()) {
    return { allowed: false, reason: "expired" };
  }
  if (recipient !== pass.recipient) return { allowed: false, reason: "wrong-recipient" };
  if (requestedFieldIds.some((fieldId) => !pass.allowedFieldIds.includes(fieldId))) {
    return { allowed: false, reason: "outside-scope" };
  }
  return {
    allowed: true,
    fieldIds: requestedFieldIds,
    receipt: {
      id: `receipt-${pass.id}-${now.getTime()}`,
      passId: pass.id,
      recipient: pass.recipient,
      purpose: pass.purpose,
      fieldIds: [...requestedFieldIds],
      readAt: now.toISOString(),
      expiresAt: pass.expiresAt,
      writeBack: pass.writeBack,
    },
  };
}

export function demoBrief(fieldIds: PassportFieldId[]): string[] {
  const lines: string[] = [];
  if (fieldIds.includes("relationship-summary")) {
    lines.push("Maya supervises your accessibility-focused design thesis.");
  }
  if (fieldIds.includes("open-commitments")) {
    lines.push("You promised a revised research question before Friday.");
  }
  if (fieldIds.includes("meeting-goals")) {
    lines.push("Aim to agree on the interview sample and next milestone.");
  }
  return lines;
}
