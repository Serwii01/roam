import type { Expense } from './db'

export interface ReminderTrip {
  trip: { id: string; title: string; user_id: string; start_date: string | null; end_date: string | null; companions: string[] | null }
  users: string[]
  expenses: Expense[]
  budget: { currency: string; closed_at: string | null } | null
}
export interface Reminder {
  user_id: string
  trip_id: string
  kind: 'reminders'
  title: string
  body: string
  url: string
  tag: string
}
export function reminders(list: ReminderTrip[], today: string): Reminder[]
