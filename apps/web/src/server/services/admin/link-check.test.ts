import { describe, expect, it } from "vitest";
import {
  googleChecker,
  isoDurationSeconds,
  parseVideoLink,
  stubChecker,
  videoUrl,
} from "./link-check";

describe("parseVideoLink", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("YouTube %s", (url, ref) => {
    expect(parseVideoLink(url)).toEqual({
      provider: "youtube",
      ref,
      url: `https://youtu.be/${ref}`,
    });
  });

  it("Drive file links, with and without a resource key", () => {
    expect(
      parseVideoLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing"),
    ).toMatchObject({
      provider: "drive",
      ref: "1AbCdEfGhIjKlMn",
    });
    expect(parseVideoLink("https://drive.google.com/open?id=1AbCdEfGhIjKlMn")?.ref).toBe(
      "1AbCdEfGhIjKlMn",
    );
    const keyed = parseVideoLink(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?resourcekey=0-xyz_1",
    );
    expect(keyed?.ref).toBe("1AbCdEfGhIjKlMn:0-xyz_1");
    expect(videoUrl("drive", keyed!.ref)).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?resourcekey=0-xyz_1",
    );
  });

  it.each([
    "not a url",
    "https://vimeo.com/123456",
    "https://youtu.be/short",
    "https://www.youtube.com/watch?v=",
    "javascript:alert(1)",
    "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn",
  ])("refuses %s", (url) => {
    expect(parseVideoLink(url)).toBeNull();
  });
});

describe("isoDurationSeconds", () => {
  it("reads YouTube durations", () => {
    expect(isoDurationSeconds("PT3M50S")).toBe(230);
    expect(isoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isoDurationSeconds("PT45S")).toBe(45);
    expect(isoDurationSeconds("P0D")).toBe(0);
    expect(isoDurationSeconds("nonsense")).toBeNull();
  });
});

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("googleChecker", () => {
  const yt = parseVideoLink("https://youtu.be/dQw4w9WgXcQ")!;
  const drive = parseVideoLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view")!;
  const video = (status: object) => ({
    items: [
      {
        status,
        contentDetails: { duration: "PT3M50S" },
        snippet: { title: "Near-far", thumbnails: { high: { url: "https://i.ytimg.com/x.jpg" } } },
      },
    ],
  });

  it("an unlisted embeddable video is ok, with duration, privacy, title and thumbnail", async () => {
    const r = await googleChecker(
      "k",
      respond(200, video({ privacyStatus: "unlisted", embeddable: true })),
    ).check(yt);
    expect(r).toEqual({
      status: "ok",
      reason: null,
      durationSeconds: 230,
      privacy: "unlisted",
      title: "Near-far",
      thumbnailUrl: "https://i.ytimg.com/x.jpg",
    });
  });

  it("missing, private and non-embeddable videos are broken with the reason", async () => {
    expect((await googleChecker("k", respond(200, { items: [] })).check(yt)).reason).toBe(
      "not_found",
    );
    expect(
      (
        await googleChecker(
          "k",
          respond(200, video({ privacyStatus: "private", embeddable: true })),
        ).check(yt)
      ).reason,
    ).toBe("private");
    expect(
      (
        await googleChecker(
          "k",
          respond(200, video({ privacyStatus: "public", embeddable: false })),
        ).check(yt)
      ).reason,
    ).toBe("not_embeddable");
  });

  it("an API error leaves the link unchecked rather than broken", async () => {
    expect(await googleChecker("k", respond(500, {})).check(yt)).toMatchObject({
      status: "unchecked",
      reason: "unavailable",
    });
    const throwing = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect((await googleChecker("k", throwing).check(yt)).status).toBe("unchecked");
  });

  it("Drive: shared videos are ok; unshared or non-video files are broken", async () => {
    const ok = await googleChecker(
      "k",
      respond(200, {
        name: "Drill.mp4",
        mimeType: "video/mp4",
        videoMediaMetadata: { durationMillis: "61500" },
      }),
    ).check(drive);
    expect(ok).toMatchObject({ status: "ok", durationSeconds: 62, privacy: "anyone_with_link" });
    expect((await googleChecker("k", respond(404, {})).check(drive)).reason).toBe("not_shared");
    expect(
      (await googleChecker("k", respond(200, { mimeType: "application/pdf" })).check(drive)).reason,
    ).toBe("not_video");
  });

  it("sends the Drive resource key header", async () => {
    let headers: HeadersInit | undefined;
    const spy = (async (_url: string, init?: RequestInit) => {
      headers = init?.headers;
      return new Response(JSON.stringify({ mimeType: "video/mp4" }));
    }) as unknown as typeof fetch;
    await googleChecker("k", spy).check(
      parseVideoLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?resourcekey=0-k")!,
    );
    expect(headers).toEqual({ "X-Goog-Drive-Resource-Keys": "1AbCdEfGhIjKlMn/0-k" });
  });
});

describe("stubChecker", () => {
  it("is deterministic: dead… is missing, priv… is private, the rest are ok", async () => {
    expect(
      (await stubChecker.check({ provider: "youtube", ref: "deadbeef123", url: "" })).reason,
    ).toBe("not_found");
    expect(
      (await stubChecker.check({ provider: "youtube", ref: "privvideo12", url: "" })).reason,
    ).toBe("private");
    expect(
      (await stubChecker.check({ provider: "youtube", ref: "dQw4w9WgXcQ", url: "" })).status,
    ).toBe("ok");
  });
});
