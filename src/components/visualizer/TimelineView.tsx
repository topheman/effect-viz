import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TimelineView() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        className={`
          shrink-0 pb-0
          md:pb-3
        `}
      >
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription>
          Visualize concurrency, delays, and scheduling
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No events to display</p>
          <p className="mt-1 text-xs">
            Run an Effect program to see the timeline
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
