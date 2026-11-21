import { Coins, Leaf, Mountain, ShieldAlert, type LucideIcon } from "lucide-react"

import { CityTag, ClassBadge, ScoreBar, SegmentBar, TripFlags } from "@/components/data-display"
import { ImpactChart } from "@/components/impact-chart"
import { PageHeader } from "@/components/page-header"
import { Panel } from "@/components/panel"
import { Card } from "@/components/ui/card"
import { COMP, MAX_TRIP_SCORE, SYM, feasibleOpportunities, materialOf, partyName, suspiciousTrips } from "@/data"
import type { Opportunity, Trip } from "@/data/types"
import { fmt, fmtInt, fmtSar } from "@/lib/format"
import { PAGES } from "@/lib/nav"
import { cn } from "@/lib/utils"

const S = SYM.summary

const byValue = [...feasibleOpportunities].sort((a, b) => b.netValue - a.netValue)
const byCo2 = [...feasibleOpportunities].sort((a, b) => b.co2 - a.co2)
const diverted = feasibleOpportunities.filter((o) => o.landfillDiverted > 0)

const KPIS: {
  label: string
  value: string
  unit: string
  icon: LucideIcon
  segments: { label: string; value: number; fill?: string }[]
}[] = [
  {
    label: "التوفير الشهري",
    value: fmtInt(S.monthlySavings),
    unit: "ريال",
    icon: Coins,
    segments: byValue.map((o) => ({ label: `${materialOf(o)}: ${fmtSar(o.netValue)}`, value: o.netValue })),
  },
  {
    label: "تحويل عن الردم",
    value: fmtInt(S.landfillDiverted),
    unit: "طن/شهر",
    icon: Mountain,
    segments: diverted.map((o) => ({ label: `${materialOf(o)}: ${fmtInt(o.landfillDiverted)} طن`, value: o.landfillDiverted })),
  },
  {
    label: "انبعاثات متجنَّبة",
    value: fmtInt(S.co2),
    unit: "طن CO₂/شهر",
    icon: Leaf,
    segments: byCo2.map((o) => ({ label: `${materialOf(o)}: ${fmt(o.co2)} طن`, value: o.co2 })),
  },
  {
    label: "رحلات مشبوهة",
    value: fmtInt(suspiciousTrips.length),
    unit: `من ${fmtInt(COMP.trips.length)}`,
    icon: ShieldAlert,
    segments: [
      { label: `مشبوهة: ${suspiciousTrips.length}`, value: suspiciousTrips.length, fill: "bg-red-500" },
      { label: `سليمة: ${COMP.trips.length - suspiciousTrips.length}`, value: COMP.trips.length - suspiciousTrips.length, fill: "bg-stone-300" },
    ],
  },
]

/**
 * Four numbers, the chart that says what they are made of, and the two lists
 * the chart does not hold. From desk nothing scrolls: the three panels share
 * the height the numbers leave, and each list shows the rows that fit it.
 */
export default function DashboardPage() {
  const item = PAGES.dashboard
  return (
    <>
      <PageHeader icon={item.icon} title={item.label} />

      <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 desk:gap-3">
        {KPIS.map((kpi) => (
          <KpiTile key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 desk:mt-3 desk:min-h-0 desk:flex-1 desk:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] desk:grid-rows-[minmax(0,1fr)] desk:gap-3">
        <ImpactChart className="lg:col-span-2 desk:col-span-1" />

        <Panel title="أعلى الفرص" aside={<CityTag city={SYM.city} />} className="desk:min-h-0" bodyClassName="py-1 sm:py-1 desk:min-h-0 desk:py-0">
          <ol className="divide-y divide-primary/10 desk:min-h-0 desk:flex-1 desk:fit-rows">
            {feasibleOpportunities.map((o, i) => (
              <OpportunityRow key={o.id} opportunity={o} className={i >= 5 ? "below-desk:hidden" : undefined} />
            ))}
          </ol>
        </Panel>

        <Panel title="أخطر الرحلات" aside={<CityTag city={COMP.city} />} className="desk:min-h-0" bodyClassName="py-1 sm:py-1 desk:min-h-0 desk:py-0">
          <ol className="divide-y divide-primary/10 desk:min-h-0 desk:flex-1 desk:fit-rows">
            {suspiciousTrips.map((t, i) => (
              <TripRow key={t.id} trip={t} className={i >= 3 ? "below-desk:hidden" : undefined} />
            ))}
          </ol>
        </Panel>
      </div>
    </>
  )
}

function KpiTile({ label, value, unit, icon: Icon, segments }: (typeof KPIS)[number]) {
  return (
    <Card className="gap-3 p-3.5 sm:p-4 desk:gap-2 desk:p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="truncate">{label}</span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl leading-none font-bold text-primary tabular-nums sm:text-3xl desk:text-2xl">{value}</span>
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </p>
      <SegmentBar segments={segments} label={segments.map((s) => s.label).join("، ")} className="desk:h-1.5" />
    </Card>
  )
}

function OpportunityRow({ opportunity: o, className }: { opportunity: Opportunity; className?: string }) {
  return (
    <li className={cn("flex items-center gap-3 py-3 desk:py-2.5", className)} title={`${partyName(o.supplier)} ← ${partyName(o.receiver)}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground tabular-nums">
        {o.rank}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-bold">{materialOf(o)}</p>
      <p className="shrink-0 text-sm font-bold text-primary tabular-nums">{fmtSar(o.netValue)}</p>
    </li>
  )
}

function TripRow({ trip: t, className }: { trip: Trip; className?: string }) {
  return (
    <li className={cn("flex flex-col gap-2 py-3 desk:gap-1.5 desk:py-2.5", className)}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-600 text-sm font-bold text-white tabular-nums">{t.rank}</span>
        <bdi dir="ltr" className="font-mono text-sm font-bold">
          {t.id}
        </bdi>
        <ClassBadge cls={t.predicted} />
        <ScoreBar value={t.score} max={MAX_TRIP_SCORE} className="ms-auto w-28" />
      </div>
      <TripFlags trip={t} max={3} />
    </li>
  )
}
