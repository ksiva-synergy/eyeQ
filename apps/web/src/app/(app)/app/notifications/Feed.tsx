"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedResponse } from "@eyeq/api-contract";
import { formatDateTime, t } from "@eyeq/i18n";
import { Button, EmptyState, Icon, cx } from "@eyeq/ui/web";
import { NextLink } from "@/components/shell/NextLink";
import { v1 } from "@/lib/athlete-api";
import { clientId } from "@/lib/client-id";
import { notificationText } from "@/lib/notification-text";

/**
 * The in-app notification feed (plan phase 6, D29): every reminder, streak nudge and
 * challenge notice, whether or not a push went out, so a web-only athlete misses nothing.
 * Unread items are marked with a dot and the word "Unread" (never colour alone, rule 13);
 * opening the feed marks them read on the server, and the marks stay for this visit.
 */
export function Feed({ feed }: { feed: FeedResponse }) {
  const [unread, setUnread] = useState(feed.unread);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || feed.unread === 0) return;
    sent.current = true;
    void v1<{ unread: number }>("POST", "/notifications/read", {}, { idempotencyKey: clientId() });
  }, [feed.unread]);

  return (
    <div className="flex flex-col gap-4 md:max-w-[48rem] md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0 font-display text-[2.25rem] leading-none font-bold [overflow-wrap:anywhere] uppercase">
          {t("feed.title")}
        </h1>
        {unread > 0 && (
          <Button variant="text" size="m" onClick={() => setUnread(0)}>
            {t("feed.markAll")}
          </Button>
        )}
      </div>
      {feed.items.length === 0 ? (
        <EmptyState icon="bell" title={t("feed.empty.title")} body={t("feed.empty.body")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {feed.items.map((n) => {
            const text = notificationText(n.kind, n.data, feed.timezone);
            const isNew = unread > 0 && !n.readAt;
            return (
              <li key={n.id}>
                <NextLink
                  href={text.url}
                  className={cx(
                    "flex min-h-11 items-start gap-3 rounded-l border p-3.5 text-text-primary no-underline",
                    isNew ? "border-primary bg-primary-subtle" : "border-border bg-surface-1",
                  )}
                >
                  <Icon name="bell" size={20} className="mt-0.5 shrink-0 text-primary-text" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="type-body-strong break-words">{text.title}</span>
                      {isNew && (
                        <span className="inline-flex items-center gap-1 type-label text-primary-text">
                          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                          {t("feed.unread")}
                        </span>
                      )}
                    </span>
                    <span className="type-body-s break-words text-text-secondary">{text.body}</span>
                    <span
                      className={cx(
                        "type-caption",
                        isNew ? "text-primary-on-subtle" : "text-text-muted",
                      )}
                    >
                      {formatDateTime(n.createdAt, feed.timezone)}
                    </span>
                  </span>
                </NextLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
