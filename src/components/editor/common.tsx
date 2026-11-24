import type { ReactNode } from 'react'
import type { Sight } from '../../lib/db'
import type { TripFields } from '../../lib/api'
import type { Api, NewSight } from '../../lib/api/types'

export type Draft = TripFields & { title: string }

export interface SightOps {
  update: (id: string, patch: Parameters<Api['updateSight']>[1]) => void
  add: (stopId: string, s: NewSight) => void
  toggle: (s: Sight) => void
  remove: (s: Sight) => void
}

export const today = () => new Date().toISOString().slice(0, 10)

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-display font-semibold">{label}</span>
        {hint && <span className="text-sm text-ink-soft">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
