/**
 * Calm backdrop: flat deep charcoal, one restrained amber wash near the top,
 * and a faint fading grid. No aurora, no floating particles.
 */
export function SiteBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-background" />
      <div className="absolute -top-48 left-1/2 h-[36rem] w-[72rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.05),transparent_70%)] blur-2xl" />
      <div className="grid-faint absolute inset-0" />
    </div>
  );
}
