export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3 animate-pulse p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 w-24 bg-base-300 rounded" />
          <div className="h-8 w-full bg-base-300 rounded" />
        </div>
      ))}
    </div>
  );
}

export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-base-content/50 py-8">
      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
