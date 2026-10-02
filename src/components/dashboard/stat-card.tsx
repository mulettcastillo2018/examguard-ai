import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Indicador del panel. Si `value` es null, la cifra llega en una fase posterior. */
export function StatCard({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value ?? "—"}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
