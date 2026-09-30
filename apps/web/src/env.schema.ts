/**
 * Environment contract for the web app.
 *
 * Rules (see README "Environment variables"):
 *   - Every variable the app reads is declared here and validated with Zod at first use.
 *   - Server-only values (secrets, credentials) are read ONLY through `getServerEnv()`
 *     in src/env.ts, which is marked `server-only` so a client import fails the build.
 *   - Only variables prefixed NEXT_PUBLIC_ reach the browser; never put secrets in them.
 *   - Real values live in `.env.local` (git-ignored). `.env.example` lists every variable
 *     with a safe placeholder and must be updated with this schema.
 */
import { z } from "zod";

export const ServerEnvSchema = z.object({
  /** Deployment environment. Distinct from NODE_ENV, which Next sets to "production" for every build. */
  APP_ENV: z.enum(["development", "test", "preview", "production"]).default("development"),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** Parses an env-like record. Throws one readable error listing every invalid variable. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = ServerEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}
