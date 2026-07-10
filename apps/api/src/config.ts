export interface ApiConfig {
  port: number;
  openAiApiKey?: string;
  textModel: string;
  transcriptionModel: string;
  aiMode: "openai" | "rules";
  allowedOrigins: string[];
}

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const requestedMode = env.AI_MODE?.trim().toLowerCase();
  if (requestedMode && requestedMode !== "openai" && requestedMode !== "rules") {
    throw new Error("AI_MODE must be either openai or rules.");
  }
  const legacyRulesMode = booleanFromEnv(env.AI_DEMO_MODE, !env.OPENAI_API_KEY);
  const aiMode = (requestedMode ?? (legacyRulesMode ? "rules" : "openai")) as "openai" | "rules";
  if (aiMode === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when AI_MODE=openai.");
  }

  const config: ApiConfig = {
    port,
    textModel: env.OPENAI_TEXT_MODEL ?? "gpt-5-mini",
    transcriptionModel:
      env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    aiMode,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "http://localhost:8081")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };

  if (env.OPENAI_API_KEY) config.openAiApiKey = env.OPENAI_API_KEY;
  return config;
}
