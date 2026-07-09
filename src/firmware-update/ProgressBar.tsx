/**
 * A simple determinate progress bar. Studio has no shared progress component,
 * so this fills the gap for both the download (③) and flash (⑤⑧) screens —
 * one visual, reused, to keep the learning cost low (design 09 §5.5).
 */
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="w-full h-3 rounded-full bg-base-300 overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
