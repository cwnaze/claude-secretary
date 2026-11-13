'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar } from './TopBar';
import { Message } from './Message';
import type { SaveError, SaveResult, SettingValue, SettingsView } from '@/lib/types';
import s from './SettingsForm.module.css';

type Option = { value: string; label: string; hint?: string };
type Field =
  | { key: string; label: string; hint?: string; kind: 'text' | 'time' | 'tz' | 'list' | 'days' | 'bool'; placeholder?: string; clearable?: boolean }
  | { key: string; label: string; hint?: string; kind: 'number'; unit: string }
  | { key: string; label: string; hint?: string; kind: 'choice'; options: Option[] };

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const LEVELS: Option[] = [
  { value: 'off', label: 'Off', hint: 'Claude only drafts. You send it yourself.' },
  { value: 'ask', label: 'Ask', hint: 'Claude shows you exactly what it will do and waits for your yes.' },
  { value: 'auto', label: 'Auto', hint: 'Claude acts without asking. Every action is still written to the log.' },
];
const OUTBOUND = ['permission_send_email', 'permission_send_invites', 'permission_contact_people'];

const PERMISSIONS: Field[] = [
  { key: 'permission_send_email', label: 'Send email', hint: 'Replies, recaps and nudges.', kind: 'choice', options: LEVELS },
  { key: 'permission_send_invites', label: 'Send calendar invites', hint: 'Invitations that reach other people.', kind: 'choice', options: LEVELS },
  { key: 'permission_contact_people', label: 'Message people', hint: 'Slack, SMS and other channels.', kind: 'choice', options: LEVELS },
  { key: 'permission_manage_calendar', label: 'Change your calendar', hint: 'Create, move or delete your own events.', kind: 'choice', options: LEVELS },
];

const PROFILE: Field[] = [
  { key: 'name', label: 'Your name', hint: 'How drafts are signed and how Claude refers to you.', kind: 'text' },
  { key: 'timezone', label: 'Time zone', hint: 'Every date and time is read in this zone.', kind: 'tz', placeholder: 'America/New_York' },
  { key: 'tone', label: 'Writing tone', hint: 'The voice Claude uses for drafts.', kind: 'text' },
  { key: 'signature', label: 'Email signature', hint: 'Added to the end of email drafts. Leave blank for none.', kind: 'text' },
  { key: 'vips', label: 'VIPs', hint: 'Names or email addresses that always come first. Separate with commas.', kind: 'list' },
];

const DAY: Field[] = [
  { key: 'work_days', label: 'Working days', hint: 'Days meetings may be booked.', kind: 'days' },
  { key: 'work_start', label: 'Day starts', kind: 'time' },
  { key: 'work_end', label: 'Day ends', kind: 'time' },
  { key: 'hard_stop', label: 'Hard stop', hint: 'Nothing is booked after this, even when you allow after-hours.', kind: 'time' },
  { key: 'default_meeting_min', label: 'Default meeting length', kind: 'number', unit: 'min' },
  { key: 'meeting_buffer_min', label: 'Gap around meetings', hint: 'Kept free on each side of existing events when finding time.', kind: 'number', unit: 'min' },
  { key: 'all_day_is_busy', label: 'All-day events block time', hint: 'Off means all-day events (holidays, trips) leave the day open.', kind: 'bool' },
];

const CAL_BACKEND: Field = {
  key: 'calendar_backend', label: 'Calendar', kind: 'choice', options: [
    { value: 'remote-ics', label: 'Calendar file', hint: 'Claude edits a local .ics file and uploads it, for subscriptions like Apple Calendar.' },
    { value: 'connector', label: 'Connected calendar', hint: 'Claude uses a calendar connected in Claude (Google, Outlook).' },
  ],
};
const CAL_FILE: Field[] = [
  { key: 'calendar_file', label: 'Calendar file', hint: 'Path to the master .ics file on this computer.', kind: 'text' },
  { key: 'calendar_public_url', label: 'Public URL', hint: 'The address calendar apps subscribe to. Optional.', kind: 'text', placeholder: 'https://' },
  { key: 'calendar_bucket', label: 'Bucket', hint: 'Fills {bucket} in the upload command.', kind: 'text' },
  { key: 'calendar_key', label: 'Object key', hint: 'Fills {key} in the upload command.', kind: 'text', placeholder: 'calendar.ics' },
];
const APPLE: Field = {
  key: 'calendar_apple', label: 'Apple Calendar', kind: 'choice', options: [
    { value: 'off', label: 'Off' },
    { value: 'macos', label: 'Read on this Mac', hint: 'Events in Calendar.app count as busy time. Other computers skip this.' },
  ],
};
const APPLE_NAMES: Field = { key: 'calendar_apple_names', label: 'Only these calendars', hint: 'Calendar names, separated by commas. Leave blank to read them all.', kind: 'list' };

const BRIEFINGS: Field[] = [
  { key: 'briefing_morning', label: 'Morning brief', hint: 'What to do today. Clear it to skip.', kind: 'time', clearable: true },
  { key: 'briefing_evening', label: 'Evening recap', hint: 'What got done, what is left, tomorrow. Clear it to skip.', kind: 'time', clearable: true },
  { key: 'briefing_days', label: 'On these days', kind: 'days' },
];

const CONNECTOR: Option[] = [{ value: 'connector', label: 'Connected' }, { value: 'none', label: 'None' }];
const CONNECTIONS: Field[] = [
  { key: 'email_backend', label: 'Email', hint: 'An email connector set up in Claude, such as Gmail.', kind: 'choice', options: CONNECTOR },
  { key: 'messaging_backend', label: 'Messaging', hint: 'A messaging connector such as Slack.', kind: 'choice', options: CONNECTOR },
];

const VAULT: Field[] = [
  {
    key: 'organize_by', label: 'Organise notes by', kind: 'choice', options: [
      { value: 'folders', label: 'Folders', hint: 'New notes go in sub-folders: Follow-ups, People and so on.' },
      { value: 'tags', label: 'Tags', hint: 'New notes sit in one folder, grouped by tag. Existing notes stay where they are.' },
    ],
  },
  { key: 'tag_prefix', label: 'Tag prefix', hint: 'Notes are tagged <prefix>/followup, <prefix>/person and so on.', kind: 'text' },
  { key: 'currency', label: 'Currency', hint: 'Default currency for expenses.', kind: 'text', placeholder: 'USD' },
  { key: 'keep_in_touch_days', label: 'Keep in touch every', hint: 'Suggested cadence when adding a person.', kind: 'number', unit: 'days' },
];

const ALL_FIELDS = [...PERMISSIONS, ...PROFILE, ...DAY, CAL_BACKEND, ...CAL_FILE, APPLE, APPLE_NAMES, ...BRIEFINGS, ...CONNECTIONS, ...VAULT];
const LABEL = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;
LABEL.calendar_feeds = 'Other calendars';

const splitList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Server errors read "<key> must be…" or "<key>: …"; pin each to its field.
function errorKey(msg: string): string | null {
  const m = /^([a-z_]+)(:|\s)/.exec(msg);
  return m && (m[1] in LABEL) ? m[1] : null;
}

let zones: string[] | null = null;
function timeZones(): string[] {
  if (!zones) { try { zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'); } catch { zones = []; } }
  return zones;
}

type Load = { status: 'loading' } | { status: 'ready'; view: SettingsView } | { status: 'not_set_up' } | { status: 'offline' };
type Notice = { tone: 'ok' | 'alert'; text: string; errors?: string[]; reload?: boolean } | null;

export function SettingsForm() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [listText, setListText] = useState<Record<string, string>>({});
  const [keepFeeds, setKeepFeeds] = useState<number[]>([]);
  const [newFeed, setNewFeed] = useState('');
  const [addFeeds, setAddFeeds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const reset = useCallback((view: SettingsView) => {
    setDraft(view.values);
    setListText(Object.fromEntries(Object.entries(view.values).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as string[]).join(', ')])));
    setKeepFeeds(view.calendar_feeds.map((_, i) => i));
    setAddFeeds([]); setNewFeed('');
  }, []);

  const fetchView = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.status === 503) return setLoad({ status: 'not_set_up' });
      if (!res.ok) return setLoad({ status: 'offline' });
      const view = (await res.json()) as SettingsView;
      reset(view); setLoad({ status: 'ready', view });
    } catch { setLoad({ status: 'offline' }); }
  }, [reset]);

  useEffect(() => { fetchView(); }, [fetchView]);

  const view = load.status === 'ready' ? load.view : null;

  // Only changed keys are sent, so edits made in Obsidian to other keys are never overwritten.
  const changes = useMemo(() => {
    if (!view) return {} as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, orig] of Object.entries(view.values)) {
      const v = Array.isArray(orig) ? (k in listText ? splitList(listText[k]) : draft[k]) : draft[k];
      if (!same(v, orig)) out[k] = v;
    }
    const allKept = keepFeeds.length === view.calendar_feeds.length;
    if (!allKept || addFeeds.length) out.calendar_feeds = { keep: keepFeeds, add: addFeeds };
    return out;
  }, [view, draft, listText, keepFeeds, addFeeds]);
  const dirty = Object.keys(changes);

  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  const fieldErrors = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const e of notice?.errors ?? []) { const k = errorKey(e); if (k) (out[k] ??= []).push(e); }
    return out;
  }, [notice]);

  async function save() {
    if (!view || !dirty.length) return;
    setSaving(true); setNotice(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ version: view.version, changes }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        const r = body as SaveResult;
        reset(r.settings); setLoad({ status: 'ready', view: r.settings });
        const what = r.changed.map((k) => LABEL[k] ?? k).join(', ');
        setNotice({ tone: 'ok', text: r.changed.length ? `Saved: ${what}.${r.schedule_changed ? ' Run sec schedule install to apply the new briefing times.' : ''}` : 'Nothing to save.' });
      } else {
        const e = (body ?? {}) as Partial<SaveError>;
        setNotice({
          tone: 'alert', reload: res.status === 409,
          text: res.status === 422 ? 'Nothing was saved. Fix these and save again:' : e.message || 'Nothing was saved.',
          errors: e.errors,
        });
      }
    } catch {
      setNotice({ tone: 'alert', text: 'Nothing was saved: the dashboard server stopped answering. Start it again with sec ui.' });
    } finally { setSaving(false); }
  }

  if (load.status === 'not_set_up') {
    return (<><TopBar current="/settings" /><Message title="Secretary isn't set up yet"><p>Run <code>/secretary:setup</code> in Claude Code, or <code>npx claude-secretary init</code> in a terminal, then reload this page.</p></Message></>);
  }
  if (load.status === 'offline') {
    return (<><TopBar current="/settings" /><Message title="Can't reach your vault"><p>The dashboard server stopped answering. Start it again with <code>sec ui</code>, then reload.</p></Message></>);
  }
  if (!view) {
    return (<><TopBar current="/settings" /><main className={s.main} aria-busy="true"><h1 className={s.h1}>Settings</h1></main></>);
  }

  const set = (k: string, v: SettingValue) => setDraft((d) => ({ ...d, [k]: v }));
  const backend = String(draft.calendar_backend);
  const apple = String(draft.calendar_apple) === 'macos';
  const rows = (fields: Field[]) => fields.map((f) => <Row key={f.key} f={f} value={draft[f.key]} text={listText[f.key]} errors={fieldErrors[f.key]} changed={f.key in changes} onValue={set} onText={(k, t) => setListText((x) => ({ ...x, [k]: t }))} />);

  return (
    <>
      <TopBar current="/settings" vault={`${view.vault} / ${view.root}`} />
      <main className={s.main}>
        <h1 className={s.h1}>Settings</h1>
        <p className={s.lede}>
          Saved to <code>{view.settings_path}</code> in your vault. Changes you make there in Obsidian show up here when you reload.
          {!view.settings_found && ' That note doesn’t exist yet; saving creates it.'}
        </p>

        <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <Section title="Permissions" aside="What Claude may do without you">{rows(PERMISSIONS)}</Section>
          <Section title="About you">{rows(PROFILE)}</Section>
          <Section title="Your day" aside="Used when finding time">{rows(DAY)}</Section>

          <Section title="Calendar">
            {rows([CAL_BACKEND])}
            {backend === 'remote-ics' && (
              <>
                {rows(CAL_FILE)}
                <ReadOnly label="Upload command" hint={view.read_only.publish_command_is_default ? 'The default: Cloudflare R2 through wrangler.' : 'Your own command.'}>
                  <code className={s.code}>{view.read_only.calendar_publish_command || '(none)'}</code>
                </ReadOnly>
              </>
            )}
            <div className={s.row} data-changed={'calendar_feeds' in changes || undefined}>
              <div className={s.label}>
                <span id="feeds-l">Other calendars</span>
                <small>Read-only feeds counted as busy time, such as a class schedule or an iCloud public calendar. Links are shortened here because they often contain private keys.</small>
              </div>
              <div className={s.control}>
                <ul className={s.feeds} aria-labelledby="feeds-l">
                  {view.calendar_feeds.map((f, i) => keepFeeds.includes(i) && (
                    <li key={`k${i}`}><span className={s.feed}>{f}</span><button type="button" className={s.link} onClick={() => setKeepFeeds((k) => k.filter((x) => x !== i))}>Remove</button></li>
                  ))}
                  {addFeeds.map((f, i) => (
                    <li key={`a${i}`}><span className={s.feed}>{f}</span><span className={s.new}>new</span><button type="button" className={s.link} onClick={() => setAddFeeds((a) => a.filter((_, j) => j !== i))}>Remove</button></li>
                  ))}
                  {view.calendar_feeds.length - keepFeeds.length > 0 && (
                    <li><span className={s.sub}>{view.calendar_feeds.length - keepFeeds.length} removed when you save.</span><button type="button" className={s.link} onClick={() => setKeepFeeds(view.calendar_feeds.map((_, i) => i))}>Undo</button></li>
                  )}
                  {!view.calendar_feeds.length && !addFeeds.length && <li className={s.sub}>None yet.</li>}
                </ul>
                <div className={s.inline}>
                  <input className={s.input} type="url" inputMode="url" placeholder="webcal:// or https:// link" value={newFeed} aria-label="Add a calendar link"
                    onChange={(e) => setNewFeed(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newFeed.trim()) { setAddFeeds((a) => [...a, newFeed.trim()]); setNewFeed(''); } } }} />
                  <button type="button" className={s.button} disabled={!newFeed.trim()} onClick={() => { setAddFeeds((a) => [...a, newFeed.trim()]); setNewFeed(''); }}>Add</button>
                </div>
                <FieldErrors errors={fieldErrors.calendar_feeds} />
              </div>
            </div>
            {rows([APPLE])}
            {view.platform !== 'darwin' && apple && <p className={s.warn}>This computer isn&rsquo;t a Mac, so Apple Calendar is skipped here. It still works on a Mac that shares this vault.</p>}
            {apple && rows([APPLE_NAMES])}
          </Section>

          <Section title="Automatic briefings" aside="Apply with sec schedule install">
            {rows(BRIEFINGS)}
            <ReadOnly label="Tools a scheduled run may use" hint="Edit in Settings.md. Kept off this page because it decides what an unattended run can do.">
              <ul className={s.tools}>{view.read_only.briefing_allowed_tools.map((t) => <li key={t}><code className={s.code}>{t}</code></li>)}</ul>
            </ReadOnly>
          </Section>

          <Section title="Connections" aside="Connected inside Claude, not here">{rows(CONNECTIONS)}</Section>
          <Section title="Vault and money">{rows(VAULT)}</Section>

          <div className={s.bar} data-dirty={dirty.length > 0 || undefined}>
            <div className={s.status} role="status" aria-live="polite">
              {notice ? (
                <div data-tone={notice.tone}>
                  <p>{notice.text}</p>
                  {notice.errors && notice.errors.length > 0 && <ul className={s.errs}>{notice.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                  {notice.reload && <button type="button" className={s.link} onClick={() => { setNotice(null); fetchView(); }}>Reload, keeping nothing from this page</button>}
                </div>
              ) : dirty.length ? (
                <p><b>{dirty.length} unsaved {dirty.length === 1 ? 'change' : 'changes'}:</b> {dirty.map((k) => LABEL[k] ?? k).join(', ')}</p>
              ) : (
                <p className={s.sub}>Everything here matches Settings.md.</p>
              )}
            </div>
            <div className={s.actions}>
              <button type="button" className={s.button} disabled={!dirty.length || saving} onClick={() => { reset(view); setNotice(null); }}>Discard</button>
              <button type="submit" className={s.primary} disabled={!dirty.length || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </form>
      </main>
    </>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className={s.section} aria-label={title}>
      <h2 className={s.h2}>{title}{aside && <small>{aside}</small>}</h2>
      {children}
    </section>
  );
}

function ReadOnly({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.label}><span>{label}</span><small>{hint}</small></div>
      <div className={s.control}>{children}</div>
    </div>
  );
}

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <ul className={s.fieldErr}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>;
}

function Row({ f, value, text, errors, changed, onValue, onText }: {
  f: Field; value: SettingValue; text?: string; errors?: string[]; changed: boolean;
  onValue: (k: string, v: SettingValue) => void; onText: (k: string, t: string) => void;
}) {
  const id = `f-${f.key}`;
  const hintId = f.hint ? `${id}-h` : undefined;
  const invalid = errors?.length ? true : undefined;
  let control: React.ReactNode;

  switch (f.kind) {
    case 'choice': {
      const cur = String(value);
      const picked = f.options.find((o) => o.value === cur);
      control = (
        <>
          <div className={s.segment} role="radiogroup" aria-labelledby={`${id}-l`} aria-describedby={hintId}>
            {f.options.map((o) => (
              <label key={o.value} className={s.seg} data-level={f.key.startsWith('permission_') ? o.value : undefined}>
                <input type="radio" name={f.key} value={o.value} checked={cur === o.value} onChange={() => onValue(f.key, o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          {picked?.hint && <p className={s.sub}>{picked.hint}</p>}
          {OUTBOUND.includes(f.key) && cur === 'auto' && <p className={s.warn}>Claude will act for you on this without asking first.</p>}
        </>
      );
      break;
    }
    case 'days': {
      const days = (value as string[]) ?? [];
      control = (
        <div className={s.days} role="group" aria-labelledby={`${id}-l`} aria-describedby={hintId}>
          {DAYS.map((d) => (
            <label key={d} className={s.day}>
              <input type="checkbox" checked={days.includes(d)}
                onChange={(e) => onValue(f.key, e.target.checked ? DAYS.filter((x) => x === d || days.includes(x)) : days.filter((x) => x !== d))} />
              <span>{DAY_LABEL[d]}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'bool':
      control = (
        <label className={s.check}>
          <input id={id} type="checkbox" checked={value === true} aria-describedby={hintId} onChange={(e) => onValue(f.key, e.target.checked)} />
          <span>{value === true ? 'Yes' : 'No'}</span>
        </label>
      );
      break;
    case 'number':
      control = (
        <div className={s.inline}>
          <input id={id} className={`${s.input} ${s.num}`} type="number" min={0} step={1} inputMode="numeric" aria-describedby={hintId} aria-invalid={invalid}
            value={Number.isFinite(value as number) ? String(value) : ''} onChange={(e) => onValue(f.key, e.target.value === '' ? NaN : Number(e.target.value))} />
          <span className={s.unit}>{f.unit}</span>
        </div>
      );
      break;
    case 'list':
      control = <input id={id} className={s.input} type="text" aria-describedby={hintId} aria-invalid={invalid} value={text ?? ''} onChange={(e) => onText(f.key, e.target.value)} />;
      break;
    case 'time':
      control = (
        <div className={s.inline}>
          <input id={id} className={`${s.input} ${s.time}`} type="time" aria-describedby={hintId} aria-invalid={invalid} value={String(value ?? '')} onChange={(e) => onValue(f.key, e.target.value)} />
          {f.clearable && (value ? <button type="button" className={s.link} onClick={() => onValue(f.key, '')}>Turn off</button> : <span className={s.unit}>Off</span>)}
        </div>
      );
      break;
    case 'tz':
      control = (
        <>
          <input id={id} className={s.input} type="text" list={`${id}-list`} autoComplete="off" spellCheck={false} placeholder={f.placeholder} aria-describedby={hintId} aria-invalid={invalid}
            value={String(value ?? '')} onChange={(e) => onValue(f.key, e.target.value)} />
          <datalist id={`${id}-list`}>{timeZones().map((z) => <option key={z} value={z} />)}</datalist>
        </>
      );
      break;
    default:
      control = <input id={id} className={s.input} type="text" spellCheck={f.key === 'tone' || f.key === 'signature'} placeholder={f.placeholder} aria-describedby={hintId} aria-invalid={invalid}
        value={String(value ?? '')} onChange={(e) => onValue(f.key, e.target.value)} />;
  }

  const groupLike = f.kind === 'choice' || f.kind === 'days';
  return (
    <div className={s.row} data-changed={changed || undefined}>
      <div className={s.label}>
        {groupLike ? <span id={`${id}-l`}>{f.label}</span> : <label id={`${id}-l`} htmlFor={id}>{f.label}</label>}
        {f.hint && <small id={hintId}>{f.hint}</small>}
      </div>
      <div className={s.control}>
        {control}
        <FieldErrors errors={errors} />
      </div>
    </div>
  );
}
