"use client";

import { Toaster as Sonner } from "sonner";
import { useAppStore } from "@/store/app-store";

/** Toaster — تم از استور سراسری (بدون وابستگی به next-themes) */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const theme = useAppStore((s) => s.theme);

  return (
    <Sonner
      theme={theme as React.ComponentProps<typeof Sonner>["theme"]}
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      dir="rtl"
      {...props}
    />
  );
}
