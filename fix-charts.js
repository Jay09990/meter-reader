/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const file = 'e:/meter-reader/meter-reader/app/dashboard/meters/[id]/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/<CartesianGrid[^>]*stroke="#1e293b"[^>]*\/>/g, '<CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-300 dark:text-slate-800" />');
c = c.replace(/tick={{ fontSize: 10, fill: "#64748b" }}/g, 'tick={{ fontSize: 10, fill: "currentColor" }}');
c = c.replace(/<XAxis([^>]*)>/g, '<XAxis$1 className="text-slate-500 dark:text-slate-400">');
c = c.replace(/<YAxis([^>]*)>/g, '<YAxis$1 className="text-slate-500 dark:text-slate-400">');

const tooltipRegex = /contentStyle={{[\s\S]*?color: "#e2e8f0",\s*}}/g;
c = c.replace(tooltipRegex, 'contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)", borderRadius: "6px", fontSize: "12px" }}');

c = c.replace(/itemStyle={{ color: "#e2e8f0" }}/g, 'itemStyle={{ color: "var(--popover-foreground)" }}');

fs.writeFileSync(file, c);
console.log("Fixed charts in " + file);
