import Link from 'next/link';
import type { Followup, HomeData, Level } from '@/lib/types';
import { clockAmPm, fromCreated, minutesOf, money, monthName, relativeDay, shortDate, unlink } from '@/lib/time';
import { obsidian } from '@/lib/obsidian';
import { Markdown, sections } from './Markdown';
import s from './DayNotes.module.css';

const ALERT_BUCKETS = new Set(['Urgent', 'Suspicious']);
const LISTED_BUCKETS = ['Urgent', 'Suspicious', 'Reply'];

const SEND_STATE: Record<Level, { pill: string; tone: 'hold' | 'ok'; header: string }> = {
  off: { pill: 'You send it', tone: 'hold', header: 'sending is off' },
  ask: { pill: 'Needs your OK', tone: 'hold', header: 'sending asks first' },
  auto: { pill: 'Ready to send', tone: 'ok', header: 'sending is automatic' },
};

const ACTION_LABEL: Record<string, string> = {
  send_email: 'send an email', send_invites: 'send an invite', contact_people: 'message someone', manage_calendar: 'change your calendar',
};

// "mcp__claude_ai_Gmail__send_email" → "Gmail · send email"
function toolName(raw: string): string {
  const parts = raw.split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return raw.replace(/_/g, ' ');
  return `${parts[1].replace(/^claude_ai_/, '').replace(/_/g, ' ')} · ${parts.slice(2).join(' ').replace(/_/g, ' ')}`;
}

function followupLine(f: Followup): string {
  const who = unlink(f.counterpart);
  if (f.kind === 'promise') return who ? `You promised ${who}` : 'You promised';
  if (f.kind === 'waiting_on') return who ? `Waiting on ${who}` : 'Waiting on someone';
  return who ? `For ${who}` : 'To do';
}

function Heading({ title, aside, href, linkLabel }: { title: string; aside?: string; href?: string; linkLabel?: string }) {
  return (
    <h2 className={s.h2}>
      {title}
      {aside && <small>{aside}</small>}
      {href && <Link href={href} className={s.more}>{linkLabel}</Link>}
    </h2>
  );
}

export function DayNotes({ data, today }: { data: HomeData; today: string }) {
  const viewingToday = data.date === today;
  const send = SEND_STATE[data.permissions.send_email] ?? SEND_STATE.off;
  const b = data.briefing;
  const briefSections = b?.body && b.date === data.date ? sections(b.body) : [];
  const [firstSection, ...moreSections] = briefSections;
  const tri = data.triage;
  const buckets = (tri?.buckets ?? []).filter((x) => x.count > 0);
  const listed = buckets.filter((x) => LISTED_BUCKETS.includes(x.name)).flatMap((x) => x.items.map((it) => ({ ...it, bucket: x.name }))).slice(0, 5);
  const due = data.followups.due;
  const people = [...data.people.birthdays.map((p) => ({ key: `b-${p.path}`, path: p.path, name: p.name, line: p.in_days === 0 ? 'Birthday today' : `Birthday ${relativeDay(p.date, data.date)}` })),
    ...data.people.reconnect.map((p) => ({ key: `r-${p.path}`, path: p.path, name: p.name, line: p.last_contact ? `Last in touch ${shortDate(p.last_contact)}` : 'No contact logged yet' }))];
  const cur = data.spend.currency || 'USD';
  const total = data.spend.totals_by_currency[cur] ?? 0;
  const top = data.spend.categories.find((c) => c.spent > 0);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const over = data.spend.categories.filter((c) => c.limit && c.spent >= 0.8 * c.limit);

  return (
    <section className={s.notes} aria-label="Notes for the day">
      <div>
        <Heading title={viewingToday ? 'Briefing' : `Briefing, ${shortDate(data.date)}`} aside={b?.created && b.date === data.date ? `written ${fromCreated(b.created, today)}` : undefined} />
        {b && b.date === data.date && (b.summary || b.body) ? (
          <>
            {b.summary && <p className={s.brief}>{b.summary}</p>}
            {firstSection && (
              <div className={s.section}>
                {firstSection.heading && <h3 className={s.h3}>{firstSection.heading}</h3>}
                <Markdown text={firstSection.body} vault={data.vault} />
              </div>
            )}
            {moreSections.length > 0 && (
              <details className={s.more2}>
                <summary>Rest of the briefing <small>{moreSections.map((x) => x.heading).filter(Boolean).join(' · ')}</small></summary>
                {moreSections.map((x, i) => (
                  <div key={i} className={s.section}>
                    {x.heading && <h3 className={s.h3}>{x.heading}</h3>}
                    <Markdown text={x.body} vault={data.vault} />
                  </div>
                ))}
              </details>
            )}
            <p className={s.sub}><a href={obsidian(data.vault, b.path)}>Open {b.title} in Obsidian</a></p>
          </>
        ) : (
          <p className={s.empty}>
            No briefing for this day{viewingToday ? ' yet. Ask Claude “brief me” and it will appear here.' : '.'}
            {b && <> The latest is from {shortDate(b.date)}: <a href={obsidian(data.vault, b.path)}>open it in Obsidian</a>.</>}
          </p>
        )}
      </div>

      <div>
        <Heading title="Inbox" aside={`${data.drafts.length} ${data.drafts.length === 1 ? 'draft' : 'drafts'} · ${send.header}`} href="/inbox" linkLabel="Open inbox" />
        {tri ? (
          <div className={s.triage}>
            <p className={s.sub}>
              Last triaged {fromCreated(tri.created ?? undefined, today) ?? relativeDay(tri.date, today)} · <a href={obsidian(data.vault, tri.path)}>open the triage note</a>
            </p>
            {tri.summary && <p className={s.triageLead}>{tri.summary}</p>}
            {buckets.length > 0 && (
              <ul className={s.buckets} aria-label="Mail by bucket">
                {buckets.map((x) => (
                  <li key={x.name} data-tone={ALERT_BUCKETS.has(x.name) ? 'alert' : undefined}><b>{x.count}</b> {x.name === 'Reply' ? 'to reply' : x.name.toLowerCase()}</li>
                ))}
              </ul>
            )}
            {listed.length > 0 && (
              <ul>
                {listed.map((it, i) => (
                  <li key={`${it.bucket}-${i}`} className={s.row}>
                    <div>
                      <b>{it.subject || it.summary || 'Untitled'}</b>
                      <span className={s.sub}>{[it.from, it.subject && it.summary].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span className={s.pill} data-tone={ALERT_BUCKETS.has(it.bucket) ? 'alert' : 'hold'}>{it.bucket === 'Reply' ? 'Reply' : it.bucket}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className={s.empty}>No triage yet. Ask Claude to “go through my inbox” and the summary will show here.</p>
        )}
        {data.drafts.length + data.blocked.length === 0 ? (
          tri ? null : <p className={s.empty}>No drafts waiting, and nothing was blocked{viewingToday ? ' today' : ''}.</p>
        ) : (
          <ul className={tri ? s.after : undefined}>
            {data.blocked.map((r) => (
              <li key={`${r.when}-${r.target}`} className={s.row}>
                <div>
                  <b>Blocked: Claude tried to {ACTION_LABEL[r.action] ?? r.action.replace(/_/g, ' ')}</b>
                  <span className={s.sub} title={r.target}>{toolName(r.target)} · {clockAmPm(minutesOf(r.when))} · logged in Log.md</span>
                </div>
                <span className={s.pill} data-tone="alert">Blocked</span>
              </li>
            ))}
            {data.drafts.slice(0, 5).map((d) => (
              <li key={d.path} className={s.row}>
                <div>
                  <a href={obsidian(data.vault, d.path)} className={s.title}>{d.subject || d.title}</a>
                  <span className={s.sub}>{[d.to && `To ${unlink(d.to)}`, d.channel !== 'email' && d.channel, fromCreated(d.created, today) && `drafted ${fromCreated(d.created, today)}`].filter(Boolean).join(' · ')}</span>
                </div>
                <span className={s.pill} data-tone={send.tone}>{send.pill}</span>
              </li>
            ))}
          </ul>
        )}
        {data.drafts.length > 5 && <p className={s.sub}>{data.drafts.length - 5} more in the inbox.</p>}
      </div>

      <div>
        <Heading title="Follow-ups" aside={due.length ? `${due.length} due` : undefined} />
        {due.length === 0 ? (
          <p className={s.empty}>
            Nothing due{viewingToday ? ' today' : ''}.
            {data.followups.waiting_on_others > 0 && ` You're waiting on ${data.followups.waiting_on_others} ${data.followups.waiting_on_others === 1 ? 'reply' : 'replies'}.`}
          </p>
        ) : (
          <ul>
            {due.slice(0, 6).map((f) => (
              <li key={f.path} className={s.row}>
                <div>
                  <a href={obsidian(data.vault, f.path)} className={s.title}>{f.title}</a>
                  <span className={s.sub}>{followupLine(f)}</span>
                </div>
                <span className={s.pill} data-tone={f.overdue_days ? 'alert' : 'due'}>
                  {f.overdue_days ? `${f.overdue_days} ${f.overdue_days === 1 ? 'day' : 'days'} late` : 'Due today'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>


      <div>
        <Heading title="Spend" aside={`${monthName(data.spend.month)} so far`} href="/expenses" linkLabel="Expenses" />
        <dl className={s.figures}>
          <div><dt>{data.spend.count} {data.spend.count === 1 ? 'expense' : 'expenses'}</dt><dd>{money(total, cur)}</dd></div>
          <div><dt>{top ? `Top: ${cap(top.category)}` : 'Top category'}</dt><dd>{top ? money(top.spent, cur) : '—'}</dd></div>
          {data.invoices[0] ? (
            <div><dt>{data.invoices[0].direction === 'receivable' ? 'Owed to you' : 'You owe'}, due {relativeDay(data.invoices[0].due, data.date)}</dt><dd>{money(data.invoices[0].amount, data.invoices[0].currency || cur)}</dd></div>
          ) : (
            <div><dt>To reimburse</dt><dd>{money(data.spend.reimbursable_outstanding, cur)}</dd></div>
          )}
        </dl>
        {over.length > 0 && (
          <p className={s.alert}>
            {over.map((c) => `${cap(c.category)}: ${money(c.spent, cur)} of your ${money(c.limit!, cur)} budget`).join(' · ')}
          </p>
        )}
      </div>

      {people.length > 0 && (
        <div>
          <Heading title="People" aside="this week" href="/contacts" linkLabel="Contacts" />
          <ul>
            {people.slice(0, 4).map((p) => (
              <li key={p.key} className={s.row}>
                <div><a href={obsidian(data.vault, p.path)} className={s.title}>{p.name}</a><span className={s.sub}>{p.line}</span></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
