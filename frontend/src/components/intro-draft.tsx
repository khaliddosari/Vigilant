import { CircleCheck, X } from "lucide-react"
import { useEffect, useId, useRef } from "react"

import { PartyArrow } from "@/components/data-display"
import { StatusPill } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import { materialOf, partyName } from "@/data"
import type { Opportunity } from "@/data/types"
import { fmt, fmtInt } from "@/lib/format"

/**
 * The intro the procurement agent drafts for one opportunity, waiting for the
 * Modon team. Approving only marks it in this page's memory: nothing is sent,
 * and the dialog says so.
 */
export function IntroDraft({
  opportunity: o,
  approved,
  onApprove,
  onClose,
}: {
  opportunity: Opportunity
  approved: boolean
  onApprove: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const supplier = partyName(o.supplier)
  const receiver = partyName(o.receiver)
  const material = materialOf(o)
  const text =
    `السلام عليكم،\n` +
    `يسرّ فريق «مدن» أن يعرّفكم على فرصة تبادل في مدينتكم الصناعية: ` +
    `${supplier} لديه ${fmt(o.quantity)} طن شهريًا من ${material}، ` +
    `ويحتاجها ${receiver} على بعد ${fmt(o.distanceKm)} كم. ` +
    `التوفير المتوقع للطرفين ≈ ${fmtInt(o.netValue)} ريال شهريًا، ويتجنب ${fmt(o.co2)} طن CO₂.\n` +
    `هل ترغبون أن نرتّب لكم تواصلًا مباشرًا؟`

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-primary/10 outline-none"
      >
        <div className="flex items-center gap-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold">
            مسودة تعريف بين مصنعين
          </h2>
          <StatusPill
            label={approved ? "اعتمدها فريق «مدن»" : "بانتظار اعتماد «مدن»"}
            tone={approved ? "done" : "running"}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <X />
          </Button>
        </div>

        <div className="flex flex-col gap-1 rounded-xl bg-secondary/55 p-3 ring-1 ring-primary/8">
          <p className="text-sm font-bold">{material}</p>
          <PartyArrow from={supplier} to={receiver} />
        </div>

        <p className="rounded-xl border border-primary/12 p-3 text-sm leading-relaxed whitespace-pre-line">
          {text}
        </p>

        <p className="text-xs text-muted-foreground">
          كتب الوكيل المسودة من أرقام الفرصة، ولا يصل شيء للمصانع قبل اعتماد
          فريق «مدن». هذا عرض توضيحي: الاعتماد لا يرسل أي رسالة.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
          <Button onClick={onApprove} disabled={approved}>
            <CircleCheck aria-hidden="true" />
            {approved ? "تم الاعتماد" : "اعتماد فريق «مدن»"}
          </Button>
        </div>
      </div>
    </div>
  )
}
