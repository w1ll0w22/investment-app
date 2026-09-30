import { Timestamp } from "@investment-app/schemas";
import { getServerEnv } from "@/env";

// Always evaluated per request; never statically cached.
export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  return Response.json({
    status: "ok",
    appEnv: env.APP_ENV,
    // Validated with the shared contract to prove the schemas package is wired into the app.
    checkedAt: Timestamp.parse(new Date().toISOString()),
  });
}
