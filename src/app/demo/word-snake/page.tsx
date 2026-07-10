import { WordSnakeDemoBoard } from "@/games/word-snake/board-demo";

export default function WordSnakeDemoPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 rounded-xl border border-dashed border-border bg-elevated/40 px-4 py-3 text-center text-[13px] text-muted">
        Demo mode — no account or Supabase needed.{" "}
        <span className="text-foreground">Aria</span> and{" "}
        <span className="text-foreground">Rex</span> are bots. Dictionary check is
        skipped; structural rules still apply.
      </div>
      <WordSnakeDemoBoard />
    </div>
  );
}
