import { cn } from "@/lib/utils";

export function UsagePaceBar({
  usedPercent,
  idealPercent,
  fillClassName,
  className,
}: {
  usedPercent: number;
  idealPercent: number;
  fillClassName: string;
  className?: string;
}) {
  const used = Math.min(100, Math.max(0, usedPercent));
  const ideal = Math.min(100, Math.max(0, idealPercent));
  const over = used > ideal;
  const room = Math.max(0, ideal - used);

  return (
    <span
      className={cn(
        "relative overflow-hidden rounded-full bg-sidebar-border/70",
        className,
      )}
    >
      <span
        data-usage-pace-used=""
        className={cn("absolute inset-y-0 left-0", fillClassName)}
        style={{ width: Math.max(used > 0 ? 2 : 0, used) + "%" }}
      />
      {room > 0 ? (
        <span
          aria-hidden="true"
          data-usage-pace-room=""
          className="absolute inset-y-0 bg-sidebar-foreground/25"
          style={{ left: used + "%", width: room + "%" }}
        />
      ) : null}
      {over ? (
        <span
          aria-hidden="true"
          data-usage-pace-ideal=""
          className="absolute inset-y-0 w-px bg-sidebar-foreground/80"
          style={{ left: ideal + "%" }}
        />
      ) : null}
    </span>
  );
}
