import Link from "next/link";
import { DoorOpen, Gamepad2, MessagesSquare } from "lucide-react";

import { Hero } from "@/components/hero";
import { AnonymousLounge } from "@/components/anonymous-lounge";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: DoorOpen,
    title: "Rooms to hang out in",
    body: "Public rooms anyone can hop into or private ones for your team — the main place coworkers meet on a break.",
  },
  {
    icon: Gamepad2,
    title: "Games for every break",
    body: "Trivia, puzzles, word games and more — quick to learn, quick to finish before your next call.",
  },
  {
    icon: MessagesSquare,
    title: "Talk off the record",
    body: "Chat anonymously in the lounge — no names, no job titles, just coworkers on a break.",
  },
];

function FeatureSection() {
  return (
    <section>
      <SectionHeading
        eyebrow="the break room"
        title="Everything a break is for"
        description="Three things, one tab: games to play, rooms to join, and an anonymous lounge to hang out in."
      />
      <Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-border-strong"
            >
              <span className="grid size-10 place-items-center rounded-xl border border-border bg-elevated text-muted">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function ClosingCTA() {
  return (
    <Reveal>
      <section className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight">
            Ready for your recess?
          </h3>
          <p className="mt-2 text-muted">
            Join your coworkers on break. No download, no setup.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/discover">Start Playing</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/rooms">Explore Rooms</Link>
          </Button>
        </div>
      </section>
    </Reveal>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 sm:px-8 lg:pt-14">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.85fr_1fr]">
        {/* LEFT — main content (~65%) */}
        <div className="flex min-w-0 flex-col gap-24 pb-4">
          <Hero />
          <FeatureSection />
          <ClosingCTA />
        </div>

        {/* RIGHT — Anonymous Lounge (~35%) */}
        <aside className="w-full lg:sticky lg:top-20">
          <div className="h-[68vh] min-h-[520px] lg:h-[calc(100vh-6.5rem)]">
            <AnonymousLounge />
          </div>
        </aside>
      </div>
    </div>
  );
}
