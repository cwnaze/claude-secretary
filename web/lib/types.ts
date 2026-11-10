// Shape of GET /api/home (skills/secretary/scripts/lib/dashboard.mjs).

export type Level = 'off' | 'ask' | 'auto';

export interface CalEvent {
  uid?: string;
  summary?: string;
  start: string; // local "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD" when allDay
  end: string;
  allDay?: boolean;
  location?: string;
  source?: string;
  recurring?: boolean;
  ours?: boolean;
  busy: boolean;
  status?: string;
}

export interface Draft { path: string; title: string; to?: string; subject?: string; channel: string; created?: string }
export interface LogRow { when: string; action: string; target: string; summary: string; status: string }
export interface Followup {
  path: string; title: string; kind: 'todo' | 'promise' | 'waiting_on' | string; status: string;
  due: string | null; counterpart?: string; overdue_days?: number;
}
export interface Category { category: string; spent: number; limit: number | null; remaining: number | null }

export interface HomeData {
  date: string;
  now: string;
  timezone: string;
  name: string;
  work_start: string; // "HH:MM"
  work_end: string;
  vault: string;
  root: string;
  settings_found: boolean;
  calendar_backend: 'remote-ics' | 'connector';
  events: CalEvent[];
  calendar_warnings: string[];
  briefing: { title: string; date: string; created: string | null; path: string; summary: string | null } | null;
  drafts: Draft[];
  blocked: LogRow[];
  sent_today: number;
  followups: { today: string; due: Followup[]; waiting_on_others: number; undated_open: Followup[] };
  people: {
    birthdays: { path: string; name: string; date: string; in_days: number }[];
    reconnect: { path: string; name: string; last_contact: string | null; due: string; overdue_days: number }[];
  };
  invoices: { path: string; title: string; direction: string; amount: number; currency?: string; due: string; overdue: boolean; status: string }[];
  spend: {
    month: string; currency: string; count: number;
    totals_by_currency: Record<string, number>;
    categories: Category[];
    reimbursable_outstanding: number;
  };
  permissions: Record<'send_email' | 'send_invites' | 'contact_people' | 'manage_calendar', Level>;
}

export type HomeState =
  | { status: 'loading' }
  | { status: 'ready'; data: HomeData }
  | { status: 'not_set_up'; message: string }
  | { status: 'offline' };
