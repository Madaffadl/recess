import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { ContactForm } from "@/components/contact-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQS } from "@/lib/data";

export const metadata: Metadata = {
  title: "About — Recess",
  description:
    "Why we built Recess: the digital break room that gives distributed teams their hallway chatter, coffee-line banter, and downtime back.",
};

const REASONS = [
  {
    n: "01",
    title: "The break room went remote",
    body: "Distributed teams lost the hallway chatter and the coffee-line banter. Recess gives that casual, unstructured time a home again.",
  },
  {
    n: "02",
    title: "Breaks make better work",
    body: "Short mental resets improve focus, creativity, and mood. Recess makes taking one genuinely enjoyable — and shared.",
  },
  {
    n: "03",
    title: "Anonymity lowers the stakes",
    body: "No titles, no hierarchy — just coworkers having fun. It's easier to be yourself, and to be playful, behind a friendly handle.",
  },
];

export default function AboutPage() {
  return (
    <PageShell className="max-w-[900px]">
      {/* Hero */}
      <div className="border-b border-border pb-12">
        <span className="terminal-badge uppercase tracking-[0.18em] text-subtle">
          about
        </span>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-[3rem]">
          Work needs a recess.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          We spend most of our waking hours at work, yet the small moments that
          made offices human — the quick game, the shared laugh, the aimless
          chat — quietly disappeared. Recess brings them back.
        </p>
      </div>

      <div className="space-y-20 py-16">
        {/* What is Recess */}
        <section>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            What is Recess?
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted">
            <p>
              Recess is a shared break room for coworkers. When you have a few
              minutes between meetings, over lunch, or during the afternoon
              slump, you open Recess to play quick multiplayer games, drop into
              rooms with your team, and chat anonymously in the lounge.
            </p>
            <p>
              Everything runs in your browser — no downloads, no setup, nothing
              to schedule. Open a tab, take your break, and close it when
              you&apos;re done. It&apos;s the digital equivalent of wandering
              over to the break room and seeing who&apos;s around.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section>
          <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
            <span className="terminal-badge uppercase tracking-[0.18em] text-subtle">
              our mission
            </span>
            <p className="mt-4 font-display text-2xl font-medium leading-snug tracking-tight sm:text-[1.75rem]">
              To make the workday feel a little more human — by giving every
              team a place to take a break, together.
            </p>
          </div>
        </section>

        {/* Why it exists */}
        <section>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Why Recess exists
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {REASONS.map((r) => (
              <div key={r.n}>
                <span className="font-mono text-sm text-primary">{r.n}</span>
                <h3 className="mt-3 font-display text-base font-semibold tracking-tight">
                  {r.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Frequently asked
          </h2>
          <Accordion
            type="single"
            collapsible
            className="mt-6 rounded-2xl border border-border bg-card px-6"
          >
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-24">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Get in touch
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Want Recess for your team, or curious about what&apos;s next? Send us
            a note — or email{" "}
            <span className="font-mono text-foreground">hello@recess.app</span>.
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>
      </div>
    </PageShell>
  );
}
