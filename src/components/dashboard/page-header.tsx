export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
