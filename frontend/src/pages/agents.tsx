import { ArrowRight, CircleCheck, Play, RotateCcw } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"

import {
  CityTag,
  ClassBadge,
  PartyArrow,
  TripFlags,
} from "@/components/data-display"
import { IntroDraft } from "@/components/intro-draft"
import { PageHeader } from "@/components/page-header"
import { StatusPill, type Tone } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  COMP,
  MAX_TRIP_SCORE,
  SYM,
  facilityLabel,
  feasibleOpportunities,
  materialOf,
  partyName,
  suspiciousTrips,
} from "@/data"
import type { Opportunity, WasteRecord } from "@/data/types"
import { AGENT_INFO, type AgentInfo } from "@/lib/agents"
import { fmt, fmtInt, fmtPct } from "@/lib/format"
import { PAGES } from "@/lib/nav"
import { cn } from "@/lib/utils"

const S = SYM.summary

/**
 * Findings per card. A phone shows three and lg four; from desk the list shows
 * as many as fit the card's height (desk:fit-rows), up to this many.
 */
const FINDINGS = 7

type Stat = { value: string; unit?: string; label: string; alert?: boolean }

/** One of an agent's three best findings: a rank, what it is, and its figure. */
type Finding = {
  key: string
  title: ReactNode
  detail: ReactNode
  figure: { value: string; unit?: string }
  alert?: boolean
  /** Set on procurement findings: opens the intro draft for Modon to approve. */
  opportunity?: Opportunity
}

/** A pair the agent turned down, with the rule that stopped it. */
type Rejected = {
  key: string
  title: ReactNode
  detail: ReactNode
  reason: string
}

/** An agent's name, goal, icon and status (lib/agents.ts), with the figures the card shows. */
type Agent = AgentInfo & {
  id: string
  /** The industrial city whose data the agent works on. */
  city: string
  stats: Stat[]
  findings: Finding[]
  /** What the card says it is doing while a run replays, in order. */
  steps: string[]
  rejected?: Rejected[]
}

/*
 * «شغّل الوكلاء» replays a run over the sample data: each card waits, works
 * (findings appear one per tick, then any pairs it rejected) and finishes, the
 * three cards a little apart. Only the timing is staged; every figure is the
 * same one the page shows at rest.
 */
const TICK_MS = 650
const STAGGER = 2

/** Ticks an agent needs: one per finding it shows, one per rejection, one to finish. */
const runLength = (a: Agent) =>
  Math.min(a.findings.length, FINDINGS) + (a.rejected?.length ?? 0) + 1

type Phase = {
  tone: Tone
  label: string
  findings: number
  rejected: number
  done: boolean
  step?: string
}

function phaseAt(agent: Agent, index: number, tick: number): Phase {
  const p = tick - index * STAGGER
  const total = runLength(agent)
  const n = Math.min(agent.findings.length, FINDINGS)
  if (p >= total)
    return {
      ...agent.status,
      findings: n,
      rejected: agent.rejected?.length ?? 0,
      done: true,
    }
  if (p < 0)
    return {
      tone: "idle",
      label: "ينتظر",
      findings: 0,
      rejected: 0,
      done: false,
      step: "بانتظار دوره",
    }
  return {
    tone: "running",
    label: "يعمل",
    done: false,
    findings: Math.min(p, n),
    rejected: Math.max(0, Math.min(p - n, agent.rejected?.length ?? 0)),
    step: agent.steps[
      Math.min(
        Math.floor((p * agent.steps.length) / total),
        agent.steps.length - 1
      )
    ],
  }
}

/**
 * A factory without its leading «مصنع»: every name starts with it, so on a
 * phone it would use up the width a truncated name has and say nothing.
 */
const bare = (name: string) => name.replace(/^مصنع\s+/, "")

/** Records the agent thinks are riskier than declared first, the surest of those at the top. */
const recordsByConcern: WasteRecord[] = [...COMP.records].sort(
  (a, b) =>
    Number(b.misdeclared) - Number(a.misdeclared) || b.confidence - a.confidence
)

function ClassShift({
  from,
  to,
}: {
  from: WasteRecord["declared"]
  to: WasteRecord["predicted"]
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="sr-only">معلنة</span>
      <ClassBadge cls={from} />
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-primary rtl:rotate-180"
      />
      <span className="sr-only">متوقعة</span>
      <ClassBadge cls={to} />
    </span>
  )
}

const AGENTS: Agent[] = [
  {
    id: "procurement",
    ...AGENT_INFO.procurement,
    city: SYM.city,
    stats: [
      {
        value: fmtInt(S.feasible),
        unit: `من ${fmtInt(S.pairs)}`,
        label: "فرص مجدية",
      },
      { value: fmtInt(S.monthlySavings), label: "ريال شهرياً" },
      { value: fmtInt(S.landfillDiverted), label: "طن عن الردم" },
    ],
    findings: feasibleOpportunities.slice(0, FINDINGS).map((o) => ({
      key: o.id,
      title: materialOf(o),
      detail: (
        <PartyArrow
          from={bare(partyName(o.supplier))}
          to={bare(partyName(o.receiver))}
        />
      ),
      figure: { value: fmtInt(o.netValue), unit: "ريال" },
      opportunity: o,
    })),
    steps: [
      "يقرأ المخلفات والاحتياجات",
      "يصنّف المواد",
      "يبحث عن مصانع مرشحة",
      "يفحص الاشتراطات والتراخيص",
      "يحسب التوفير وCO₂",
      "يرتّب الفرص",
    ],
    rejected: SYM.opportunities
      .filter((o) => !o.feasible)
      .map((o) => ({
        key: o.id,
        title: materialOf(o),
        detail: (
          <PartyArrow
            from={bare(partyName(o.supplier))}
            to={bare(partyName(o.receiver))}
          />
        ),
        reason: o.exclusion ?? "لا تستوفي الاشتراطات",
      })),
  },
  {
    id: "classification",
    ...AGENT_INFO.classification,
    city: COMP.city,
    stats: [
      { value: fmtInt(COMP.records.length), label: "سجلات" },
      {
        value: fmtInt(COMP.records.filter((r) => r.misdeclared).length),
        label: "أخطر من المعلن",
        alert: true,
      },
      {
        value: fmtInt(COMP.records.filter((r) => r.review).length),
        label: "مراجعة بشرية",
      },
    ],
    findings: recordsByConcern.slice(0, FINDINGS).map((r) => ({
      key: r.id,
      title: facilityLabel(r.facility),
      detail: <ClassShift from={r.declared} to={r.predicted} />,
      figure: { value: fmtPct(r.confidence) },
      alert: r.misdeclared,
    })),
    steps: [
      "يقرأ سجلات النفايات",
      "يطابق الوصف بفئة المخلف",
      "يقيس درجة الثقة",
      "يحيل الغامض لمراجعة بشرية",
    ],
  },
  {
    id: "tracking",
    ...AGENT_INFO.tracking,
    city: COMP.city,
    stats: [
      { value: fmtInt(COMP.trips.length), label: "رحلات" },
      { value: fmtInt(suspiciousTrips.length), label: "مشبوهة", alert: true },
      { value: fmt(MAX_TRIP_SCORE), label: "أعلى خطورة" },
    ],
    findings: suspiciousTrips.slice(0, FINDINGS).map((t) => ({
      key: t.id,
      title: (
        <bdi dir="ltr" className="font-mono">
          {t.id}
        </bdi>
      ),
      detail: <TripFlags trip={t} max={1} />,
      figure: { value: fmt(t.score) },
      alert: true,
    })),
    steps: [
      "يقرأ مسارات GPS",
      "يقارن أوزان البوابة",
      "يطابق رصد الدرون",
      "يحسب درجة الخطورة",
    ],
  },
]

const RUN_TICKS = Math.max(...AGENTS.map((a, i) => i * STAGGER + runLength(a)))

export default function AgentsPage() {
  const item = PAGES.agents
  // At rest the page shows the finished run; a replay counts ticks up to RUN_TICKS.
  const [tick, setTick] = useState(RUN_TICKS)
  const [draft, setDraft] = useState<Opportunity | null>(null)
  const [approved, setApproved] = useState<Set<string>>(() => new Set())
  const running = tick < RUN_TICKS

  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => setTick((t) => t + 1), TICK_MS)
    return () => window.clearTimeout(id)
  }, [running, tick])

  return (
    <>
      <PageHeader
        icon={item.icon}
        title={item.label}
        actions={
          <>
            <span className="text-xs text-muted-foreground">
              على بيانات عيّنة «مدن»
            </span>
            <Button onClick={() => setTick(0)} disabled={running}>
              {tick === RUN_TICKS ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {running ? "الوكلاء يعملون…" : "شغّل الوكلاء"}
            </Button>
          </>
        }
      />
      {/* grid-cols-1 (a minmax(0,1fr) track), not an auto track: an auto track
          grows to the widest unbreakable line inside a card and overflows a phone */}
      <ul className="grid grid-cols-1 gap-5 lg:grid-cols-3 desk:min-h-0 desk:flex-1 desk:grid-rows-[minmax(0,1fr)] desk:gap-4">
        {AGENTS.map((agent, i) => (
          <li key={agent.id} className="flex min-w-0 desk:min-h-0">
            <AgentCard
              agent={agent}
              phase={phaseAt(agent, i, tick)}
              replaying={running}
              approved={approved}
              onOpen={setDraft}
            />
          </li>
        ))}
      </ul>
      {draft && (
        <IntroDraft
          opportunity={draft}
          approved={approved.has(draft.id)}
          onApprove={() => setApproved((s) => new Set(s).add(draft.id))}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  )
}

function AgentCard({
  agent,
  phase,
  replaying,
  approved,
  onOpen,
}: {
  agent: Agent
  phase: Phase
  replaying: boolean
  approved: Set<string>
  onOpen: (o: Opportunity) => void
}) {
  const headingId = useId()
  const { icon: Icon } = agent
  const finished = phase.done
  return (
    <Card
      role="group"
      aria-labelledby={headingId}
      aria-busy={!phase.done}
      className="min-w-0 flex-1 gap-4 bg-card p-4 shadow-(--glass-shadow) ring-(--glass-edge) backdrop-blur-xl backdrop-saturate-150 sm:p-5 desk:min-h-0 desk:gap-3 desk:p-4"
    >
      <header className="flex shrink-0 flex-col gap-2 desk:gap-1.5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-(--glass-shadow) ring-1 ring-white/10 desk:size-10">
            <Icon aria-hidden="true" className="size-6 desk:size-5" />
          </span>
          <h2
            id={headingId}
            className="min-w-0 flex-1 text-lg leading-snug font-bold"
          >
            {agent.name}
          </h2>
          <StatusPill label={phase.label} tone={phase.tone} />
        </div>
        {/* lg to xl: three narrow cards, so two lines are reserved and the strips below line up across cards */}
        <p className="text-sm text-balance text-muted-foreground lg:min-h-13 xl:min-h-0">
          {phase.step && replaying ? (
            <span className="font-medium text-blue-900" aria-live="polite">
              {phase.step}…
            </span>
          ) : (
            agent.goal
          )}
        </p>
      </header>

      <dl className="grid shrink-0 grid-cols-3 divide-x divide-primary/12 rounded-xl bg-secondary/55 py-3 ring-1 ring-primary/8 desk:py-2">
        {agent.stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center"
          >
            <dd className="order-1 flex flex-wrap items-baseline justify-center gap-x-1">
              <span
                className={cn(
                  "text-xl leading-none font-bold tabular-nums transition-opacity duration-500",
                  stat.alert ? "text-red-800" : "text-primary",
                  !finished && "opacity-25"
                )}
              >
                {finished ? stat.value : "—"}
              </span>
              {stat.unit && finished && (
                <span className="text-xs leading-none font-medium text-muted-foreground">
                  {stat.unit}
                </span>
              )}
            </dd>
            <dt className="order-2 text-xs leading-tight text-balance text-muted-foreground lg:min-h-9 xl:min-h-0">
              {stat.label}
            </dt>
          </div>
        ))}
      </dl>

      <section
        aria-label="أهم النتائج"
        className="flex flex-col desk:min-h-0 desk:flex-1"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-primary/12 pb-2 desk:pb-1.5">
          <h3 className="text-sm font-bold">أهم النتائج</h3>
          <CityTag city={agent.city} />
        </div>
        <ol className="divide-y divide-primary/10 desk:fit-rows desk:min-h-0 desk:flex-1">
          {agent.findings.map((finding, i) => {
            const o = finding.opportunity
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums",
                    finding.alert
                      ? "bg-red-600 text-white"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {o && approved.has(o.id) ? (
                    <CircleCheck className="size-4" />
                  ) : (
                    fmtInt(i + 1)
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                  <p className="truncate text-sm font-bold">{finding.title}</p>
                  {finding.detail}
                </div>
                <p
                  className={cn(
                    "shrink-0 text-end leading-tight",
                    finding.alert ? "text-red-800" : "text-primary"
                  )}
                >
                  <span className="block text-sm font-bold tabular-nums">
                    {finding.figure.value}
                  </span>
                  {finding.figure.unit && (
                    <span className="block text-xs font-medium text-muted-foreground">
                      {finding.figure.unit}
                    </span>
                  )}
                </p>
              </>
            )
            return (
              <li
                key={finding.key}
                className={cn(
                  "transition-all duration-500",
                  i >= phase.findings && "invisible translate-y-1 opacity-0",
                  i === 3 && "max-lg:hidden",
                  i > 3 && "below-desk:hidden"
                )}
              >
                {o ? (
                  <button
                    type="button"
                    onClick={() => onOpen(o)}
                    title="عرض مسودة التعريف"
                    className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none desk:py-2"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 py-2.5 desk:py-2">
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {agent.rejected && agent.rejected.length > 0 && (
          <div className="mt-2 shrink-0 border-t border-red-200 pt-2">
            <h3 className="mb-1 text-xs font-bold text-red-800">
              رفضها الوكيل
            </h3>
            <ul className="flex flex-col gap-1.5">
              {agent.rejected.map((r, i) => (
                <li
                  key={r.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5 ring-1 ring-red-200 transition-all duration-500",
                    i >= phase.rejected && "invisible translate-y-1 opacity-0"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-md bg-red-600 text-xs font-bold text-white"
                  >
                    ✕
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-xs font-bold">{r.title}</p>
                    {r.detail}
                  </div>
                  <p className="max-w-[45%] shrink-0 text-end text-xs leading-tight font-bold text-red-800">
                    {r.reason}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Card>
  )
}
