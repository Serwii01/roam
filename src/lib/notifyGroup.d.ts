export interface PendingNotification {
  user_id: string
  trip_id: string | null
  kind: string
  title: string
  body: string
  url: string
  tag: string | null
}
export function groupNotifications<T extends PendingNotification>(rows: T[]): T[]
