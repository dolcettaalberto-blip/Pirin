"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Today",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
      </svg>
    ),
  },
  {
    href: "/week",
    label: "Week",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/trajectory",
    label: "Trajectory",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 17l5-6 4 3 6-8" />
        <path d="M15 6h3v3" />
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 border-t border-[var(--hairline)] bg-[var(--surface)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:bottom-auto md:top-0 md:border-t-0 md:border-b md:pb-0">
      <div className="mx-auto max-w-md grid grid-cols-3 md:max-w-4xl md:flex md:items-center md:gap-2 md:px-6">
        <span className="hidden md:block md:mr-auto font-bold tracking-tight">
          Pirin <span className="text-accent">Tracker</span>
        </span>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium md:flex-row md:gap-2 md:px-4 md:py-3.5 md:text-[13px] ${
                active ? "text-accent" : "text-muted hover:text-ink-2"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
