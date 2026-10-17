import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { stripQueryAndHash, stripUrlQueries } from "./posthog-before-send";

const event = (over: Partial<CaptureResult> = {}): CaptureResult => ({
  uuid: "u1",
  event: "$pageview",
  properties: {},
  ...over,
});

describe("stripQueryAndHash", () => {
  it.each([
    [
      "https://eyeq-nu.vercel.app/app?next=%2Fadmin&phone=919000000001",
      "https://eyeq-nu.vercel.app/app",
    ],
    ["https://eyeq-nu.vercel.app/app/drills/7#step-2", "https://eyeq-nu.vercel.app/app/drills/7"],
    ["https://eyeq-nu.vercel.app/sign-in?x=1#y", "https://eyeq-nu.vercel.app/sign-in"],
    ["https://eyeq-nu.vercel.app/app", "https://eyeq-nu.vercel.app/app"],
    ["/relative/path?q=1#h", "/relative/path"],
  ])("%s -> %s", (input, out) => {
    expect(stripQueryAndHash(input)).toBe(out);
  });
});

describe("stripUrlQueries", () => {
  it("strips the event's URLs and leaves the path", () => {
    const out = stripUrlQueries(
      event({
        properties: {
          $current_url: "https://eyeq-nu.vercel.app/app?ref=abc#top",
          $session_entry_url: "https://eyeq-nu.vercel.app/sign-in?phone=919000000001",
          $pathname: "/app",
          $browser: "Chrome",
        },
      }),
    );
    expect(out?.properties).toEqual({
      $current_url: "https://eyeq-nu.vercel.app/app",
      $session_entry_url: "https://eyeq-nu.vercel.app/sign-in",
      $pathname: "/app",
      $browser: "Chrome",
    });
  });

  it("strips the copies set on the person", () => {
    const out = stripUrlQueries(
      event({
        event: "$identify",
        $set: { $current_url: "https://eyeq-nu.vercel.app/app?x=1" },
        $set_once: {
          $current_url: "https://eyeq-nu.vercel.app/sign-in?next=%2Fapp",
          $initial_current_url: "https://eyeq-nu.vercel.app/sign-in?next=%2Fapp#h",
          $initial_browser: "Chrome",
        },
      }),
    );
    expect(out?.$set).toEqual({ $current_url: "https://eyeq-nu.vercel.app/app" });
    expect(out?.$set_once).toEqual({
      $current_url: "https://eyeq-nu.vercel.app/sign-in",
      $initial_current_url: "https://eyeq-nu.vercel.app/sign-in",
      $initial_browser: "Chrome",
    });
  });

  it("does not modify the event it was given", () => {
    const props = { $current_url: "https://eyeq-nu.vercel.app/app?x=1" };
    stripUrlQueries(event({ properties: props }));
    expect(props.$current_url).toBe("https://eyeq-nu.vercel.app/app?x=1");
  });

  it("passes null and URL-free events through", () => {
    expect(stripUrlQueries(null)).toBeNull();
    const e = event({ properties: { $browser: "Chrome" } });
    expect(stripUrlQueries(e)?.properties).toBe(e.properties);
    expect(stripUrlQueries(e)?.$set).toBeUndefined();
  });
});
