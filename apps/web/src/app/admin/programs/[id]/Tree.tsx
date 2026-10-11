"use client";
import type React from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderDrill, BuilderProgram } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Button, Icon, cx } from "@eyeq/ui/web";
import { moveDrill, moveModule, moveSession, nudge, orderOf, sameOrder, type Order } from "./order";

export type Selection =
  | { kind: "program" }
  | { kind: "module"; id: string }
  | { kind: "session"; id: string }
  | { kind: "drill"; sessionId: string; id: string };

const key = (s: Selection) =>
  s.kind === "program"
    ? "p"
    : s.kind === "drill"
      ? `d:${s.sessionId}:${s.id}`
      : `${s.kind[0]}:${s.id}`;

function parse(id: string): Selection | null {
  const [k, a, b] = id.split(":");
  if (k === "m" && a) return { kind: "module", id: a };
  if (k === "s" && a) return { kind: "session", id: a };
  if (k === "d" && a && b) return { kind: "drill", sessionId: a, id: b };
  return null;
}

export function sessionLabel(s: { dayNumber: number; title: string | null }) {
  return s.title
    ? t("admin.builder.sessionRowTitled", { day: s.dayNumber, title: s.title })
    : t("admin.builder.sessionRow", { day: s.dayNumber });
}

/** Status as a glyph plus words for screen readers: never colour alone. */
export function LinkGlyph({ status }: { status: BuilderDrill["linkStatus"] }) {
  const name = status === "ok" ? "check" : status === "broken" ? "alert" : "eye";
  return (
    <span
      className={cx(
        "inline-flex shrink-0",
        status === "ok"
          ? "text-success-text"
          : status === "broken"
            ? "text-cta-text"
            : "text-text-muted",
      )}
    >
      <Icon name={name} size={16} label={t(`admin.builder.link.${status}`)} />
    </span>
  );
}

function Row({
  item,
  depth,
  selected,
  name,
  meta,
  onSelect,
  onNudge,
  children,
}: {
  item: Selection;
  depth: 0 | 1 | 2;
  selected: boolean;
  name: string;
  meta?: React.ReactNode;
  onSelect: () => void;
  onNudge: (delta: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: key(item) });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "flex min-h-11 items-center gap-1 rounded-control",
        depth === 1 && "pl-5",
        depth === 2 && "pl-10",
        selected ? "bg-primary-subtle text-primary-on-subtle" : "text-text-primary",
        isDragging && "relative z-10 bg-surface-1 shadow-e1",
      )}
      data-testid={`tree-${item.kind}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("admin.builder.dragHandle", { name })}
        className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-control text-text-muted touch-none"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {t("admin.builder.grip")}
        </span>
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onKeyDown={(e) => {
          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          onNudge(e.key === "ArrowUp" ? -1 : 1);
        }}
        className={cx(
          "flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-control py-1 pr-2.5 text-left text-sm",
          depth === 0 ? "font-extrabold" : "font-bold",
        )}
      >
        {children}
        {meta && <span className="ml-auto flex items-center gap-1.5">{meta}</span>}
      </button>
    </div>
  );
}

const metaChip = (text: string) => (
  <span className="inline-flex min-h-[1.625rem] items-center rounded-s border border-border bg-surface-1 px-2 type-caption font-bold tabular-nums">
    {text}
  </span>
);

export function Tree({
  program,
  selection,
  onSelect,
  onReorder,
  onAddModule,
  onAddDrill,
  busy,
}: {
  program: BuilderProgram;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onReorder: (order: Order) => void;
  onAddModule: () => void;
  onAddDrill: (sessionId: string) => void;
  busy: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const order = orderOf(program);
  const commit = (next: Order) => {
    if (!sameOrder(next, order)) onReorder(next);
  };

  function onDragEnd(e: DragEndEvent) {
    const a = parse(String(e.active.id));
    const o = e.over ? parse(String(e.over.id)) : null;
    if (!a || !o) return;
    if (a.kind === "module" && o.kind === "module") {
      commit(
        moveModule(
          order,
          a.id,
          order.findIndex((m) => m.id === o.id),
        ),
      );
    } else if (a.kind === "session" && o.kind === "session") {
      const m = order.find((x) => x.sessions.some((s) => s.id === o.id))!;
      commit(
        moveSession(
          order,
          a.id,
          m.id,
          m.sessions.findIndex((s) => s.id === o.id),
        ),
      );
    } else if (a.kind === "session" && o.kind === "module") {
      const m = order.find((x) => x.id === o.id)!;
      commit(moveSession(order, a.id, m.id, m.sessions.length));
    } else if (a.kind === "drill" && o.kind === "drill") {
      const s = order.flatMap((m) => m.sessions).find((x) => x.id === o.sessionId)!;
      commit(moveDrill(order, a.sessionId, a.id, o.sessionId, s.drillIds.indexOf(o.id)));
    } else if (a.kind === "drill" && o.kind === "session") {
      const s = order.flatMap((m) => m.sessions).find((x) => x.id === o.id)!;
      commit(moveDrill(order, a.sessionId, a.id, o.id, s.drillIds.length));
    }
  }

  const selectedKey = key(selection);
  const xp = (d: BuilderDrill) =>
    t("admin.builder.drillXp", { xp: d.xp ?? program.defaults.drillXp });

  return (
    <div
      className="flex flex-col gap-0.5 rounded-l border border-border bg-surface-1 p-3"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2.5">
        <span className="type-label text-text-muted">{t("admin.builder.structure")}</span>
        <Button variant="ghost" size="s" icon="plus" onClick={onAddModule}>
          {t("admin.builder.addModule")}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => onSelect({ kind: "program" })}
        aria-current={selection.kind === "program" ? "true" : undefined}
        className={cx(
          "flex min-h-11 items-center gap-2 rounded-control px-2.5 text-left text-sm font-extrabold",
          selection.kind === "program" && "bg-primary-subtle text-primary-on-subtle",
        )}
      >
        <Icon name="settings" size={16} />
        {t("admin.builder.settings")}
      </button>
      {program.modules.length === 0 && (
        <p className="px-2.5 py-3 text-sm text-text-secondary">{t("admin.builder.emptyTree")}</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={program.modules.map((m) => `m:${m.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {program.modules.map((m) => {
            const first = m.sessions[0]?.dayNumber;
            const last = m.sessions.at(-1)?.dayNumber;
            const days =
              first === undefined
                ? t("admin.builder.moduleEmpty")
                : first === last
                  ? t("admin.builder.moduleDay", { from: first })
                  : t("admin.builder.moduleDays", { from: first, to: last ?? first });
            const mName = t("admin.builder.moduleRow", { n: m.order, title: m.title });
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                <Row
                  item={{ kind: "module", id: m.id }}
                  depth={0}
                  selected={selectedKey === `m:${m.id}`}
                  name={mName}
                  meta={metaChip(days)}
                  onSelect={() => onSelect({ kind: "module", id: m.id })}
                  onNudge={(d) => commit(nudge(order, { kind: "module", id: m.id }, d))}
                >
                  <span className="min-w-0 break-words">{mName}</span>
                </Row>
                <SortableContext
                  items={m.sessions.map((s) => `s:${s.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {m.sessions.map((s) => {
                    const sName = sessionLabel(s);
                    const open =
                      (selection.kind === "session" && selection.id === s.id) ||
                      (selection.kind === "drill" && selection.sessionId === s.id);
                    return (
                      <div key={s.id} className="flex flex-col gap-0.5">
                        <Row
                          item={{ kind: "session", id: s.id }}
                          depth={1}
                          selected={selectedKey === `s:${s.id}`}
                          name={sName}
                          meta={metaChip(
                            t("admin.builder.sessionMeta", {
                              n: s.drills.length,
                              min: s.estMinutes,
                            }),
                          )}
                          onSelect={() => onSelect({ kind: "session", id: s.id })}
                          onNudge={(d) => commit(nudge(order, { kind: "session", id: s.id }, d))}
                        >
                          <span className="min-w-0 break-words">{sName}</span>
                        </Row>
                        {open && (
                          <SortableContext
                            items={s.drills.map((d) => `d:${s.id}:${d.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {s.drills.map((d) => (
                              <Row
                                key={d.id}
                                item={{ kind: "drill", sessionId: s.id, id: d.id }}
                                depth={2}
                                selected={selectedKey === `d:${s.id}:${d.id}`}
                                name={d.title}
                                meta={
                                  <>
                                    <LinkGlyph status={d.linkStatus} />
                                    {metaChip(xp(d))}
                                  </>
                                }
                                onSelect={() =>
                                  onSelect({ kind: "drill", sessionId: s.id, id: d.id })
                                }
                                onNudge={(dl) =>
                                  commit(
                                    nudge(order, { kind: "drill", sessionId: s.id, id: d.id }, dl),
                                  )
                                }
                              >
                                <span className="min-w-0 break-words">{d.title}</span>
                              </Row>
                            ))}
                            {/* py-1: room for the 36 px button's 44 px hit area between rows. */}
                            <div className="py-1 pl-10">
                              <Button
                                variant="ghost"
                                size="s"
                                icon="plus"
                                onClick={() => onAddDrill(s.id)}
                              >
                                {t("admin.builder.addDrill")}
                              </Button>
                            </div>
                          </SortableContext>
                        )}
                      </div>
                    );
                  })}
                </SortableContext>
              </div>
            );
          })}
        </SortableContext>
      </DndContext>
      <p className="px-2.5 pt-2 type-caption text-text-muted">{t("admin.builder.moveHint")}</p>
    </div>
  );
}
