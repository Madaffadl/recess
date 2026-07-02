"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";

import { Button } from "@/components/ui/button";
import { DashboardPreview } from "@/components/dashboard-preview";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Hero() {
  return (
    <section>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="max-w-2xl"
      >
        <motion.span
          variants={item}
          className="terminal-badge uppercase tracking-[0.18em] text-subtle"
        >
          the digital break room
        </motion.span>

        <motion.h1
          variants={item}
          className="mt-4 font-display text-[2.5rem] font-semibold leading-[1.06] tracking-tight sm:text-5xl xl:text-[3.5rem]"
        >
          Take a break.
          <br />
          Stay connected.
        </motion.h1>

        <motion.p
          variants={item}
          className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
        >
          Play games, join rooms, and chat anonymously with coworkers during
          downtime.
        </motion.p>

        <motion.div
          variants={item}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <Button asChild size="lg">
            <Link href="/discover">Start Playing</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/rooms">Explore Rooms</Link>
          </Button>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mt-14"
      >
        <DashboardPreview />
      </motion.div>
    </section>
  );
}
