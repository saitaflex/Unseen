import { describe, expect, it } from "vitest";
import { isAtlasRoute } from "./route";

describe("router", () => {
  it("shows the landing page at the root", () => {
    expect(isAtlasRoute("/", "", "")).toBe(false);
  });
  it("opens the atlas for /atlas, deep links and the method page", () => {
    expect(isAtlasRoute("/atlas", "", "")).toBe(true);
    expect(isAtlasRoute("/", "?d=pku&c=SDN", "")).toBe(true);
    expect(isAtlasRoute("/", "?story=3", "")).toBe(true);
    expect(isAtlasRoute("/", "", "#method")).toBe(true);
  });
  it("ignores unrelated query parameters", () => {
    expect(isAtlasRoute("/", "?utm_source=hacknation", "")).toBe(false);
  });
});
