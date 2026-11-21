import { ArrowRight, Table2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link } from "react-router"

import { ClassBadge, PartyArrow, TripFlags, tripFlags } from "@/components/data-display"
import { Button, buttonVariants } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { feasibleOpportunities, materialOf, partyName, suspiciousTrips } from "@/data"
import { fmt, fmtInt, fmtPct } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The dashboard's chart: what the platform's numbers are made of.
 *
 * Ranked horizontal bars, one series at a time (a bar's length is the only
 * thing it says, so every bar is the same colour): the monthly saving, the
 * waste kept out of landfill or the CO₂ avoided by each opportunity the agents
 * found, or the risk score of each suspicious trip. Hover, focus or tap a bar
 * and the strip under the chart reads out everything about it, the other two
 * measures included. The table button swaps the bars for the same figures as a
 * table, for anyone the bars do not serve.
 *
 * Plain HTML on purpose: bars grow from the start edge (the right, in Arabic)
 * with no direction to fix, a row is a button, and nothing needs a library.
 */

type Measure = "savings" | "landfill" | "co2"
type Metric = Measure | "risk"

/** The unit sits next to the label (the title, a column head), so CO₂ does not repeat itself. */
const MEASURES: Record<Measure, { label: string; unit: string; format: (n: number) => string }> = {
  savings: { label: "التوفير", unit: "ريال/شهر", format: fmtInt },
  landfill: { label: "الردم", unit: "طن/شهر", format: fmtInt },
  co2: { label: "CO₂", unit: "طن/شهر", format: (n) => fmt(n) },
}

const METRICS: { id: Metric; label: string }[] = [
  ...(Object.keys(MEASURES) as Measure[]).map((id) => ({ id, label: MEASURES[id].label })),
  { id: "risk", label: "المخاطر" },
]

type Deal = { id: string; rank: number; name: string; from: string; to: string } & Record<Measure, number>

const DEALS: Deal[] = feasibleOpportunities.map((o) => ({
  id: o.id,
  rank: o.rank ?? 0,
  name: materialOf(o),
  from: partyName(o.supplier),
  to: partyName(o.receiver),
  savings: o.netValue,
  landfill: o.landfillDiverted,
  co2: o.co2,
}))

type Row = { id: string; label: ReactNode; text: string; value: number; display: string }

function rowsFor(metric: Metric): Row[] {
  if (metric === "risk") {
    return suspiciousTrips.map((t) => ({
      id: t.id,
      label: (
        <bdi dir="ltr" className="font-mono">
          {t.id}
        </bdi>
      ),
      text: t.id,
      value: t.score,
      display: fmt(t.score),
    }))
  }
  const { format } = MEASURES[metric]
  return DEALS.filter((d) => d[metric] > 0)
    .sort((a, b) => b[metric] - a[metric])
    .map((d) => ({ id: d.id, label: d.name, text: d.name, value: d[metric], display: format(d[metric]) }))
}

export function ImpactChart({ className }: { className?: string }) {
  const [metric, setMetric] = useState<Metric>("savings")
  const [asTable, setAsTable] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  const risk = metric === "risk"
  const unit = risk ? "درجة" : MEASURES[metric].unit
  const rows = rowsFor(metric)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((sum, r) => sum + r.value, 0) || 1
  const shown = rows.find((r) => r.id === active) ?? rows[0]

  return (
    <section
      aria-label="الأثر والمخاطر"
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-2xl bg-card text-card-foreground shadow-(--glass-shadow) ring-1 ring-(--glass-edge) backdrop-blur-xl backdrop-saturate-150",
        className
      )}
    >
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-primary/12 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5 desk:gap-x-2 desk:px-4 desk:py-2.5">
        {/* The title is set in the swash letterforms, which run wide: it keeps
            its room and the unit gives way (and has plain letters), so the
            two can never run into the switch beside them. */}
        <h2 className="flex min-w-0 items-baseline gap-2 text-base leading-snug font-bold whitespace-nowrap">
          <span className="shrink-0">{risk ? "المخاطر حسب الرحلة" : "الأثر حسب الفرصة"}</span>
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground [font-feature-settings:normal]">{unit}</span>
        </h2>
        <ToggleGroup
          aria-label="ما يقيسه المخطط"
          value={[metric]}
          onValueChange={(v) => {
            if (v[0]) {
              setMetric(v[0] as Metric)
              setActive(null)
            }
          }}
          spacing={1}
          className="col-span-2 row-start-2 w-full rounded-xl bg-secondary/60 p-0.5 ring-1 ring-primary/8 sm:col-span-1 sm:row-start-auto sm:w-auto"
        >
          {METRICS.map(({ id, label }) => (
            <ToggleGroupItem
              key={id}
              value={id}
              className="h-10 flex-1 rounded-lg px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground sm:flex-none lg:h-8 desk:px-2.5"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={asTable}
          aria-label="عرض الأرقام كجدول"
          title="عرض الأرقام كجدول"
          onClick={() => setAsTable(!asTable)}
          className={cn("size-10 rounded-xl lg:size-8", asTable && "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          <Table2 aria-hidden="true" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5 desk:gap-2 desk:p-3.5">
        {asTable ? (
          <FigureTable metric={metric} unit={unit} />
        ) : (
          <>
            <ul aria-label={risk ? "درجة الخطورة لكل رحلة مشبوهة" : `${MEASURES[metric as Measure].label} لكل فرصة`} className="flex min-h-0 flex-1 flex-col justify-center gap-1">
              {rows.map((row) => {
                const dim = active !== null && active !== row.id
                return (
                  <li key={row.id} className="flex min-h-10 max-h-12 flex-1 basis-0 lg:min-h-8 desk:min-h-5">
                    <button
                      type="button"
                      onPointerEnter={(e) => e.pointerType === "mouse" && setActive(row.id)}
                      onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
                      onFocus={() => setActive(row.id)}
                      onBlur={() => setActive(null)}
                      onClick={() => setActive(row.id)}
                      aria-label={`${row.text}: ${row.display} ${unit}، ${fmtPct(row.value / total)} من المجموع`}
                      className="grid w-full grid-cols-[minmax(4.5rem,8.5rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 text-start transition-colors outline-none hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <span className={cn("truncate text-sm transition-opacity", dim && "opacity-50")}>{row.label}</span>
                      <span className="flex min-w-0 items-center">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-4 shrink-0 rounded-e-[4px] transition-[width,opacity] duration-300 motion-reduce:transition-none",
                            risk ? "bg-red-600" : "bg-chart-1",
                            dim && "opacity-45"
                          )}
                          style={{ width: `max(3px, calc((100% - 4.5rem) * ${row.value / max}))` }}
                        />
                        <span className={cn("ms-2 shrink-0 text-sm font-bold tabular-nums transition-opacity", dim && "opacity-55")}>{row.display}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {shown && <Readout id={shown.id} share={shown.value / total} metric={metric} />}
          </>
        )}
      </div>
    </section>
  )
}

/** Everything about the bar under the pointer: the strip that stands in for a tooltip. */
function Readout({ id, share, metric }: { id: string; share: number; metric: Metric }) {
  const deal = DEALS.find((d) => d.id === id)
  const trip = suspiciousTrips.find((t) => t.id === id)
  return (
    <div className="shrink-0 rounded-xl bg-secondary/55 px-3 py-2 ring-1 ring-primary/8 desk:py-1.5">
      {deal && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-1 basis-44 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground tabular-nums">
              {fmtInt(deal.rank)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold desk:leading-5">{deal.name}</p>
              <PartyArrow from={deal.from} to={deal.to} className="desk:leading-4" />
            </div>
          </div>
          <dl className="flex shrink-0 items-start gap-4">
            {(Object.keys(MEASURES) as Measure[]).map((key) => (
              <Figure key={key} label={MEASURES[key].label} value={MEASURES[key].format(deal[key])} lit={key === metric} />
            ))}
            <Figure label="الحصة" value={fmtPct(share)} />
          </dl>
        </div>
      )}
      {trip && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="flex min-w-0 flex-1 basis-44 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-600 text-sm font-bold text-white tabular-nums">
                {fmtInt(trip.rank ?? 0)}
              </span>
              <bdi dir="ltr" className="font-mono text-sm font-bold">
                {trip.id}
              </bdi>
              <ClassBadge cls={trip.predicted} />
            </p>
            <dl className="flex shrink-0 items-start gap-4">
              <Figure label="الدرجة" value={fmt(trip.score)} lit alert />
              <Figure label="الحصة" value={fmtPct(share)} />
            </dl>
            <Link
              to={`/tracking?trip=${trip.id}`}
              className={cn(buttonVariants({ variant: "ghost" }), "h-10 shrink-0 gap-1.5 rounded-xl px-2.5 text-primary hover:bg-secondary lg:h-9")}
            >
              على الخريطة
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </Link>
          </div>
          {/* Why the trip is flagged. The list beside the chart says the same, so
              a window too short for both gives the chips up first. */}
          <TripFlags trip={trip} max={3} className="desk-tight:hidden" />
        </div>
      )}
    </div>
  )
}

function Figure({ label, value, lit, alert }: { label: string; value: string; lit?: boolean; alert?: boolean }) {
  return (
    <div className={cn("text-center leading-tight", !lit && "text-muted-foreground")}>
      <dd className={cn("text-sm font-bold tabular-nums desk:leading-5", lit && (alert ? "text-red-800" : "text-primary"))}>{value}</dd>
      <dt className="text-xs desk:leading-4">{label}</dt>
    </div>
  )
}

/** The same figures as the bars, as a table: the view that needs no pointer and no colour. */
function FigureTable({ metric, unit }: { metric: Metric; unit: string }) {
  const risk = metric === "risk"
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl ring-1 ring-primary/10">
      <table className="w-full text-sm">
        <caption className="sr-only">{risk ? "درجة الخطورة لكل رحلة مشبوهة" : "أثر كل فرصة"}</caption>
        <thead className="sticky top-0 bg-secondary text-xs text-muted-foreground">
          {risk ? (
            <tr>
              <Th>الرحلة</Th>
              <Th end>{unit}</Th>
              <Th>الأسباب</Th>
            </tr>
          ) : (
            <tr>
              <Th>الفرصة</Th>
              {(Object.keys(MEASURES) as Measure[]).map((key) => (
                <Th key={key} end unit={MEASURES[key].unit}>
                  {MEASURES[key].label}
                </Th>
              ))}
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-primary/10">
          {risk
            ? suspiciousTrips.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="px-2.5 py-1.5 text-start font-bold whitespace-nowrap sm:px-3">
                    <bdi dir="ltr" className="font-mono">
                      {t.id}
                    </bdi>
                  </th>
                  <td className="px-2.5 py-1.5 text-end font-bold whitespace-nowrap text-red-800 tabular-nums sm:px-3">{fmt(t.score)}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground sm:px-3">{tripFlags(t).map((f) => f.label).join("، ")}</td>
                </tr>
              ))
            : [...DEALS]
                .sort((a, b) => b.savings - a.savings)
                .map((d) => (
                  <tr key={d.id}>
                    <th scope="row" className="px-2.5 py-1.5 text-start font-bold sm:px-3 sm:whitespace-nowrap">
                      {d.name}
                    </th>
                    {(Object.keys(MEASURES) as Measure[]).map((key) => (
                      <td key={key} className="px-2.5 py-1.5 text-end whitespace-nowrap tabular-nums sm:px-3">
                        {MEASURES[key].format(d[key])}
                      </td>
                    ))}
                  </tr>
                ))}
        </tbody>
      </table>
    </div>
  )
}

/** A column head: the label, and when the column is a measure, its unit on a second line. */
function Th({ children, unit, end }: { children: ReactNode; unit?: string; end?: boolean }) {
  return (
    <th scope="col" className={cn("px-2.5 py-2 align-bottom font-medium whitespace-nowrap sm:px-3", end ? "text-end" : "text-start")}>
      {children}
      {unit && <span className="block text-[0.6875rem] leading-tight font-normal">{unit}</span>}
    </th>
  )
}
