"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server component tree while background work (e.g. an AI draft) is pending. */
export function AutoRefresh({ everyMs = 2500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
