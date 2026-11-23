import { VersionSelector } from "./VersionSelector";

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
        short:hidden
      `}
    >
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <div className="ml-2 shrink-0">
        <VersionSelector />
      </div>
      <span className="ml-2 min-w-0 truncate text-sm text-muted-foreground">
        {description}
      </span>
    </header>
  );
}
