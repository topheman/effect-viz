import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ExecutionLog() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="text-base">Execution Log</CardTitle>
        <CardDescription>Step-by-step execution events</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No events logged</p>
          <p className="mt-1 text-xs">
            Events will appear here during execution
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
