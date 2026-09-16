"use client";

import { useRef, useState, type ReactNode, useCallback } from "react";
import { Loader2, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pull-to-Refresh برای موبایل:
 * وقتی اسکرول بالای صفحه است و کاربر به پایین می‌کشد، نشانگر ظاهر شده
 * و پس از عبور از آستانه، تابع onRefresh اجرا می‌شود.
 */
export function PullToRefresh({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const THRESHOLD = 70;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY <= 0) {
        // مقاومت تدریجی
        setPull(Math.min(delta * 0.4, 90));
      } else {
        setPull(0);
        pulling.current = false;
        startY.current = null;
      }
    },
    []
  );

  const onTouchEnd = useCallback(async () => {
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPull(0);
    pulling.current = false;
    startY.current = null;
  }, [pull, refreshing, onRefresh]);

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* نشانگر کشیدن */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 md:hidden"
        style={{ height: refreshing ? 56 : pull }}
        aria-hidden="true"
      >
        <div
          className={cn(
            "w-10 h-10 rounded-full bg-card border border-gold/30 flex items-center justify-center",
            refreshing && "animate-pulse"
          )}
          style={{
            transform: `rotate(${progress * 180}deg)`,
            opacity: pull > 8 || refreshing ? 1 : 0,
          }}
        >
          {refreshing ? (
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          ) : (
            <ArrowDownUp className="w-5 h-5 text-gold" />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
