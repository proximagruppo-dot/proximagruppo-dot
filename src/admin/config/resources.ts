import { Lamp, ScrollText, UserRound, Waves, Radio, type LucideIcon } from 'lucide-react'

export interface ResourceColumn {
  key: string
  label: string
  format?: (value: unknown) => string
  /** Render a dropdown filter on this column. Options are fetched as distinct
   *  values when `options` is omitted, or taken verbatim when it is given (for
   *  small known domains, where a distinct query is wasted work). */
  filterable?: boolean
  options?: string[]
  /** Numeric columns sort and align differently from text. */
  numeric?: boolean
}

/** A foreign key, so the table can show `3 (ada@example.com)` instead of a bare
 *  id and offer a preview of the referenced row. */
export interface ResourceRelation {
  sourceField: string
  targetResource: string
  targetIdField: string
  /** The column on the target table to show as the human-readable label. */
  labelField: string
}

export interface ResourceConfig {
  name: string
  label: string
  icon: LucideIcon
  idField: string
  defaultSort: { field: string; order: 'asc' | 'desc' }
  /** Columns a free-text search runs across (case-insensitive contains). */
  searchFields: string[]
  /** The timestamp column the date-range filter applies to. */
  dateField?: string
  columns: ResourceColumn[]
  relations?: ResourceRelation[]
  /** Whether create/edit/delete are offered. Row-level security (supabase/
   *  007_admin_access.sql) grants admins INSERT/UPDATE/DELETE on lamp_registry
   *  and lamp_id only -- everything else is select-only, so the buttons are
   *  hidden there rather than shown and then rejected by the database. */
  writable?: boolean
}

const dateTime = (value: unknown) => (value ? new Date(value as string).toLocaleString() : '—')
const truncate = (value: unknown) => {
  const s = String(value ?? '')
  return s.length > 70 ? `${s.slice(0, 70)}…` : s
}

export const resources: ResourceConfig[] = [
  {
    name: 'users',
    label: 'Users',
    icon: UserRound,
    idField: 'id',
    defaultSort: { field: 'created_at', order: 'desc' },
    searchFields: ['email', 'full_name'],
    dateField: 'created_at',
    columns: [
      { key: 'email', label: 'Email' },
      { key: 'full_name', label: 'Name' },
      { key: 'provider', label: 'Provider', filterable: true },
      { key: 'locale', label: 'Locale', filterable: true },
      { key: 'created_at', label: 'Joined', format: dateTime },
    ],
  },
  {
    name: 'model',
    label: 'Sleep Analysis',
    icon: Waves,
    idField: 'id',
    defaultSort: { field: 'recorded_at', order: 'desc' },
    searchFields: ['watch_model', 'sleep_stage'],
    dateField: 'recorded_at',
    relations: [
      { sourceField: 'user_id', targetResource: 'users', targetIdField: 'id', labelField: 'email' },
    ],
    columns: [
      { key: 'user_id', label: 'User' },
      { key: 'watch_model', label: 'Watch', filterable: true },
      { key: 'sleep_stage', label: 'Stage', filterable: true },
      { key: 'avg_heart_rate', label: 'Avg HR', numeric: true },
      { key: 'sleep_score', label: 'Score', numeric: true },
      { key: 'session_start', label: 'Session start', format: dateTime },
      { key: 'session_end', label: 'Session end', format: dateTime },
      { key: 'recorded_at', label: 'Recorded', format: dateTime },
    ],
  },
  {
    name: 'lamp_registry',
    label: 'Lamp Registry',
    icon: Lamp,
    idField: 'id',
    defaultSort: { field: 'created_at', order: 'desc' },
    searchFields: ['mac_address', 'note'],
    dateField: 'created_at',
    writable: true,
    columns: [
      { key: 'mac_address', label: 'MAC address' },
      { key: 'note', label: 'Note' },
      { key: 'created_at', label: 'Added', format: dateTime },
    ],
  },
  {
    name: 'lamp_id',
    label: 'Lamp Assignments',
    icon: Radio,
    idField: 'id',
    defaultSort: { field: 'created_at', order: 'desc' },
    searchFields: ['lamp_name', 'mac_address'],
    dateField: 'created_at',
    writable: true,
    relations: [
      { sourceField: 'user_id', targetResource: 'users', targetIdField: 'id', labelField: 'email' },
    ],
    columns: [
      { key: 'lamp_name', label: 'Lamp name' },
      { key: 'mac_address', label: 'MAC address' },
      { key: 'user_id', label: 'Owner (user id)' },
      { key: 'created_at', label: 'Assigned', format: dateTime },
    ],
  },
  {
    name: 'lamp_log',
    label: 'Lamp Logs',
    icon: ScrollText,
    idField: 'id',
    defaultSort: { field: 'logged_at', order: 'desc' },
    searchFields: ['message', 'lamp_name', 'mac_address'],
    dateField: 'logged_at',
    relations: [
      // 001_schema.sql: lamp_log.lamp_id references lamp_id(id).
      { sourceField: 'lamp_id', targetResource: 'lamp_id', targetIdField: 'id', labelField: 'lamp_name' },
    ],
    columns: [
      { key: 'logged_at', label: 'Time', format: dateTime },
      { key: 'lamp_id', label: 'Lamp ref', numeric: true },
      { key: 'lamp_name', label: 'Lamp', filterable: true },
      { key: 'mac_address', label: 'MAC', filterable: true },
      // Small, fixed domains straight out of 001_schema.sql's own comments:
      // tag is APP (the phone) or DEV (the lamp); level is I | W | E.
      { key: 'tag', label: 'Tag', filterable: true, options: ['APP', 'DEV'] },
      { key: 'level', label: 'Level', filterable: true, options: ['I', 'W', 'E'] },
      { key: 'app_version', label: 'App', filterable: true },
      { key: 'fw_version', label: 'FW', filterable: true },
      { key: 'message', label: 'Message', format: truncate },
    ],
  },
]

export const getResource = (name: string) => resources.find((r) => r.name === name)
