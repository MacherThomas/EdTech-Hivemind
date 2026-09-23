"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "chat", label: "Chat" },
  { slug: "guide", label: "AI study guide" },
  { slug: "materials", label: "Materials" },
  { slug: "tutors", label: "Tutors" },
  { slug: "knowledge", label: "Knowledge base" },
];

export function CourseTabs({ courseId }: { courseId: string }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Course sections">
      {TABS.map((t) => {
        const href = `/courses/${courseId}/${t.slug}`;
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link key={t.slug} href={href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
