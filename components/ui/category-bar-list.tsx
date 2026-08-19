interface CategoryBarListItem {
  name: string;
  value: number;
  color: string;
}

export function CategoryBarList({ data }: { data: CategoryBarListItem[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="w-full space-y-3">
      {data.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">
            {item.name}
          </span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-sm text-foreground">
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
