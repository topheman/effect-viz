interface HeaderProps {
  title?: string;
  description?: string;
}

export function Header({
  title = import.meta.env.VITE_SHORT_TITLE,
  description = import.meta.env.VITE_TITLE,
}: HeaderProps) {
  return (
    <header
      className={`
        flex h-12 shrink-0 items-center border-b border-border bg-card px-4
      `}
    >
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <span className="ml-2 text-sm text-muted-foreground">{description}</span>
    </header>
  );
}
