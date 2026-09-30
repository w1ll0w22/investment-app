import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../src/env.schema";

describe("server environment", () => {
  it("applies safe defaults when optional variables are absent", () => {
    expect(parseServerEnv({})).toEqual({ APP_ENV: "development" });
  });
  it("accepts a declared value", () => {
    expect(parseServerEnv({ APP_ENV: "production" }).APP_ENV).toBe("production");
  });
  it("rejects an invalid value with a readable message naming the variable", () => {
    expect(() => parseServerEnv({ APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });
  it("does not copy undeclared variables into the parsed env", () => {
    expect(parseServerEnv({ APP_ENV: "test", SOME_SECRET: "x" })).toEqual({ APP_ENV: "test" });
  });
});
