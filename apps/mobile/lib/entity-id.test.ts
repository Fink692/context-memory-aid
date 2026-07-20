import { describe, expect, it } from "vitest";
import { ContactSchema } from "@context/shared";
import { createContactId } from "./entity-id";

describe("entity IDs", () => {
  it.each([63, 64, 100, 500])("keeps a %i-character contact name inside the persisted schema", (length) => {
    const id = createContactId("A".repeat(length), 1_752_270_600_000, 0.123456);
    expect(id.length).toBeLessThanOrEqual(80);
    expect(ContactSchema.shape.id.safeParse(id).success).toBe(true);
  });

  it("uses a safe fallback for a name without ASCII slug characters", () => {
    expect(createContactId("李", 1, 0)).toMatch(/^contact-person-/);
  });
});
