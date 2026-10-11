"use client";
import type React from "react";
import { createContext, useContext } from "react";

/**
 * The coach's own time zone (their profile's), read on the server by the admin layout.
 * Admin dates are formatted in it, so the server render and the browser agree whatever
 * zone the browser is in.
 */
const AdminTimeZone = createContext<string>("Asia/Kolkata");

export function AdminTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return <AdminTimeZone.Provider value={timeZone}>{children}</AdminTimeZone.Provider>;
}

export const useAdminTimeZone = () => useContext(AdminTimeZone);
