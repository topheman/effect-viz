interface HeaderProps {
  title?: string;
}

export function Header({ title = "EffectFlow" }: HeaderProps) {
  return (
    <header
      className={`
        flex h-12 shrink-0 items-center border-b border-border bg-card px-4
      `}
    >
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <span className="ml-2 text-sm text-muted-foreground">
        Effect Runtime Visualizer
      </span>
    </header>
  );
}
