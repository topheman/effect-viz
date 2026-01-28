import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function FiberTreeView() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="text-base">Fiber Tree</CardTitle>
        <CardDescription>
          Visualize fiber hierarchy and relationships
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No fibers to display</p>
          <p className="mt-1 text-xs">Run an Effect program to see fibers</p>
        </div>
      </CardContent>
    </Card>
  );
}
