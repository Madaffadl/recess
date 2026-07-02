"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Check className="size-5" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold">
          Thanks — message received.
        </p>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll get back to you within a day or two.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required placeholder="Jane Doe" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="jane@company.com"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          required
          placeholder="Tell us about your team…"
          className="min-h-28"
        />
      </div>
      <div>
        <Button type="submit">Send message</Button>
      </div>
    </form>
  );
}
