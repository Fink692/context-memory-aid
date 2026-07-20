const SAFE_MUTATION_MESSAGE_PREFIXES = [
  "A workspace can contain at most ",
  "An event can contain at most ",
  "This memory already has ",
  "This person already has ",
  "Workspace memories can contain at most ",
] as const;

/**
 * Domain-limit errors are intentionally written for people. Storage and
 * implementation errors stay behind a stable recovery message.
 */
export function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error
    && SAFE_MUTATION_MESSAGE_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
    return error.message;
  }
  return fallback;
}
