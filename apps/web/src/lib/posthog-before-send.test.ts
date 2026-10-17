import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { stripQueryAndHash, scrubUrlProperties } from "./posthog-before-send";

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

describe("scrubUrlProperties", () => {
  it("strips the event's URLs and leaves the path", () => {
    const out = scrubUrlProperties(
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
    const out = scrubUrlProperties(
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

  it("removes referrers from the event and the person", () => {
    const out = scrubUrlProperties(
      event({
        event: "$identify",
        properties: {
          $referrer: "https://www.google.com/search?q=arjun+r",
          $referring_domain: "www.google.com",
          $session_entry_referrer: "https://chat.example/invite?u=42",
          $session_entry_referring_domain: "chat.example",
          $browser: "Chrome",
        },
        $set: { $referrer: "https://www.google.com/", $referring_domain: "www.google.com" },
        $set_once: {
          $referrer: "https://www.google.com/",
          $referring_domain: "www.google.com",
          $initial_referrer: "https://www.google.com/",
          $initial_referring_domain: "www.google.com",
          $initial_os: "Mac OS X",
        },
      }),
    );
    expect(out?.properties).toEqual({ $browser: "Chrome" });
    expect(out?.$set).toEqual({});
    expect(out?.$set_once).toEqual({ $initial_os: "Mac OS X" });
  });

  it("does not modify the event it was given", () => {
    const props = {
      $current_url: "https://eyeq-nu.vercel.app/app?x=1",
      $referrer: "https://a.example/",
    };
    scrubUrlProperties(event({ properties: props }));
    expect(props).toEqual({
      $current_url: "https://eyeq-nu.vercel.app/app?x=1",
      $referrer: "https://a.example/",
    });
  });

  it("passes null and URL-free events through", () => {
    expect(scrubUrlProperties(null)).toBeNull();
    const e = event({ properties: { $browser: "Chrome" } });
    expect(scrubUrlProperties(e)?.properties).toBe(e.properties);
    expect(scrubUrlProperties(e)?.$set).toBeUndefined();
  });
});
