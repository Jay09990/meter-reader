// Central chart color tokens resolved from the live CSS custom properties.
export function getChartTheme() {
  if (typeof window === "undefined") {
    return {
      grid: "#e4e4e7",
      tick: "#71717a",
      tooltipBg: "#ffffff",
      tooltipText: "#18181b",
      tooltipBorder: "#e4e4e7",
    };
  }

  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim();

  return {
    grid: value("--border"),
    tick: value("--muted-foreground"),
    tooltipBg: value("--popover"),
    tooltipText: value("--popover-foreground"),
    tooltipBorder: value("--border"),
  };
}

