import { z } from "zod";

export const CONTACT_SHARE_CARD_VERSION = 1 as const;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function safeText(maximumLength: number) {
  return z.string()
    .trim()
    .min(1)
    .max(maximumLength)
    .refine((value) => !CONTROL_CHARACTERS.test(value), {
      message: "Shared contact fields cannot contain control characters.",
    });
}

const optionalSafeText = (maximumLength: number) => safeText(maximumLength).optional();

const SharedEmailSchema = z.string()
  .trim()
  .max(254)
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Shared email addresses cannot contain control characters.",
  })
  .pipe(z.email());

const SharedPhoneSchema = safeText(40).refine((value) => /\d/u.test(value), {
  message: "Shared phone numbers must contain at least one digit.",
});

const SharedHttpsUrlSchema = z.string()
  .max(2_048)
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Shared social links cannot contain control characters.",
  })
  .pipe(z.url())
  .refine((value) => value.startsWith("https://") && !/^https:\/\/[^/?#]*@/iu.test(value), {
    message: "Shared social links must be HTTPS URLs without embedded credentials.",
  });

/** A deliberately smaller social-link shape than the private Contact model. */
export const ContactShareSocialLinkSchema = z.object({
  platform: safeText(40),
  url: SharedHttpsUrlSchema,
}).strict();

/**
 * The complete, versioned public contract for a shared contact.
 *
 * Keep this schema strict: callers must project a private Contact into this
 * allowlist rather than serializing or spreading the original record.
 */
export const ContactShareCardSchema = z.object({
  version: z.literal(CONTACT_SHARE_CARD_VERSION),
  displayName: safeText(100),
  company: optionalSafeText(120),
  role: optionalSafeText(120),
  email: SharedEmailSchema.optional(),
  phone: SharedPhoneSchema.optional(),
  socialLinks: z.array(ContactShareSocialLinkSchema).max(12).optional(),
}).strict();

export type ContactShareSocialLink = z.infer<typeof ContactShareSocialLinkSchema>;
export type ContactShareCard = z.infer<typeof ContactShareCardSchema>;
