import type { Metadata } from "next";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "Components · EyeQ design system" };

// Laid out like the "DS · Components" board for side-by-side comparison (plan phase 3).
export default function ComponentsGallery() {
  return <Gallery />;
}
