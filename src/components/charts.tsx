import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalysisResult } from "@/lib/types";

const SENT_COLORS = {
  positive: "var(--positive)",
  neutral: "var(--neutral)",
  mixed: "var(--mixed)",
  negative: "var(--negative)",
} as const;

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "var(--shadow-card-value)",
};

export function SentimentDonut({ sentiment }: { sentiment: AnalysisResult["sentiment"] }) {
  const data = (["negative", "mixed", "neutral", "positive"] as const)
    .map((k) => ({ key: k, name: k[0]!.toUpperCase() + k.slice(1), value: sentiment[k] }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-6 @sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.key} fill={SENT_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-2xl font-semibold text-foreground">{total}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">unique</p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {(["negative", "mixed", "neutral", "positive"] as const).map((k) => {
          const v = sentiment[k];
          const pct = total ? Math.round((v / total) * 100) : 0;
          return (
            <li key={k} className="text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 capitalize text-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: SENT_COLORS[k] }} />
                  {k}
                </span>
                <span className="font-medium text-muted-foreground">
                  {v} · {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SENT_COLORS[k] }} />
              </div>
            </li>
          );
        })}
        {sentiment.unlabeled > 0 && (
          <li className="text-xs text-muted-foreground">{sentiment.unlabeled} items were not labelled by the AI.</li>
        )}
      </ul>
    </div>
    </div>
  );
}

export function HorizontalBars({
  data,
  height,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  const h = height ?? Math.max(160, data.length * 38);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="value" name="Feedback" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  data,
}: {
  data: { label: string; feedback: number; complaints: number }[];
}) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="feedback" name="All feedback" fill="var(--primary-soft)" radius={[6, 6, 0, 0]} barSize={28} />
          <Line dataKey="complaints" name="Complaints" stroke="var(--negative)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
