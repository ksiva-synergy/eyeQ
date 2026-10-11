import type { BuilderProgram, Reorder } from "@eyeq/api-contract";

/**
 * The builder's order as the reorder endpoint takes it, and pure moves over it. Every
 * drag or keyboard move computes the whole new order and sends it once.
 */
export type Order = Reorder["modules"];

export function orderOf(p: BuilderProgram): Order {
  return p.modules.map((m) => ({
    id: m.id,
    sessions: m.sessions.map((s) => ({ id: s.id, drillIds: s.drills.map((d) => d.id) })),
  }));
}

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

export function moveModule(order: Order, moduleId: string, to: number): Order {
  const from = order.findIndex((m) => m.id === moduleId);
  return from < 0 ? order : moved(order, from, to);
}

/** Moves a session to a position in a module (its own or another). */
export function moveSession(
  order: Order,
  sessionId: string,
  toModuleId: string,
  to: number,
): Order {
  const fromModule = order.find((m) => m.sessions.some((s) => s.id === sessionId));
  const session = fromModule?.sessions.find((s) => s.id === sessionId);
  if (!fromModule || !session || !order.some((m) => m.id === toModuleId)) return order;
  return order.map((m) => {
    let sessions =
      m.id === fromModule.id ? m.sessions.filter((s) => s.id !== sessionId) : m.sessions;
    if (m.id === toModuleId) {
      sessions = [...sessions];
      sessions.splice(Math.max(0, Math.min(to, sessions.length)), 0, session);
    }
    return { ...m, sessions };
  });
}

/** Moves a drill placement within its session or to another; refused if already there. */
export function moveDrill(
  order: Order,
  fromSessionId: string,
  drillId: string,
  toSessionId: string,
  to: number,
): Order {
  const sessions = order.flatMap((m) => m.sessions);
  const target = sessions.find((s) => s.id === toSessionId);
  if (!target || !sessions.some((s) => s.id === fromSessionId)) return order;
  if (fromSessionId !== toSessionId && target.drillIds.includes(drillId)) return order;
  return order.map((m) => ({
    ...m,
    sessions: m.sessions.map((s) => {
      let ids = s.id === fromSessionId ? s.drillIds.filter((d) => d !== drillId) : s.drillIds;
      if (s.id === toSessionId) {
        ids = [...ids];
        ids.splice(Math.max(0, Math.min(to, ids.length)), 0, drillId);
      }
      return { ...s, drillIds: ids };
    }),
  }));
}

/** One step up or down within its list (Alt + arrow keys). */
export function nudge(
  order: Order,
  item:
    | { kind: "module"; id: string }
    | { kind: "session"; id: string }
    | { kind: "drill"; sessionId: string; id: string },
  delta: -1 | 1,
): Order {
  if (item.kind === "module") {
    const i = order.findIndex((m) => m.id === item.id);
    return moveModule(order, item.id, i + delta);
  }
  if (item.kind === "session") {
    const m = order.find((x) => x.sessions.some((s) => s.id === item.id));
    if (!m) return order;
    const i = m.sessions.findIndex((s) => s.id === item.id);
    return moveSession(order, item.id, m.id, i + delta);
  }
  const s = order.flatMap((m) => m.sessions).find((x) => x.id === item.sessionId);
  if (!s) return order;
  return moveDrill(order, s.id, item.id, s.id, s.drillIds.indexOf(item.id) + delta);
}

export const sameOrder = (a: Order, b: Order) => JSON.stringify(a) === JSON.stringify(b);
