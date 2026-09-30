import "server-only";
import { parseServerEnv, type ServerEnv } from "./env.schema";

let cached: ServerEnv | undefined;

/** Validated server environment. Server code only; importing this from a client component fails the build. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
