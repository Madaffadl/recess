import Link from "next/link";

import { Logo } from "@/components/logo";

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "Discover", href: "/discover" },
      { label: "Rooms", href: "/rooms" },
      { label: "Anonymous Lounge", href: "/" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/about" },
      { label: "Contact", href: "/about#contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/about" },
      { label: "Terms", href: "/about" },
      { label: "Status", href: "/about" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-24 border-t border-border">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Logo showCursor={false} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The digital break room for coworkers. Play, join rooms, and chat
              anonymously during downtime.
            </p>
            <p className="terminal-badge mt-5 text-subtle">
              made for the 3pm slump
            </p>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h3 className="terminal-badge uppercase tracking-wider text-subtle">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-subtle">
            © {new Date().getFullYear()} Recess. All breaks reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="terminal-badge text-subtle">
              all systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
