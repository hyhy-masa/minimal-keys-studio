interface SettingsCardProps {
  title: string;
  description?: string;
  defaultNote?: string;
  children: React.ReactNode;
}

export function SettingsCard({
  title,
  description,
  defaultNote,
  children,
}: SettingsCardProps) {
  return (
    <section className="flex flex-col gap-2 p-3 rounded-lg bg-base-200/30 border border-base-300/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {defaultNote && (
          <span className="text-sm text-base-content/40">{defaultNote}</span>
        )}
      </div>
      {description && (
        <p className="text-sm text-base-content/50">{description}</p>
      )}
      <div className="mt-1">{children}</div>
    </section>
  );
}
