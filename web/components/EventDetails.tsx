'use client';

import { useEffect, useRef } from 'react';
import type { CalEvent } from '@/lib/types';
import { clockAmPm, dayTitle, minutesOf, range, relativeDay, shortDate } from '@/lib/time';
import { obsidian, safeHref } from '@/lib/obsidian';
import { Inline } from './Markdown';
import s from './EventDetails.module.css';

function when(e: CalEvent): string {
  if (e.deadline && e.due) return `Due ${clockAmPm(minutesOf(e.due))}, ${dayTitle(e.due)}`;
  if (e.allDay) {
    const last = e.end > e.start ? new Date(Date.parse(`${e.end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : e.start;
    return last === e.start ? `All day, ${dayTitle(e.start)}` : `All day, ${shortDate(e.start)} – ${shortDate(last)}`;
  }
  const a = minutesOf(e.start); const multi = e.end.slice(0, 10) !== e.start.slice(0, 10);
  return multi ? `${dayTitle(e.start)} ${clockAmPm(a)} – ${shortDate(e.end)} ${clockAmPm(minutesOf(e.end))}` : `${dayTitle(e.start)}, ${range(a, minutesOf(e.end))}`;
}

function sourceLabel(src: string | undefined): string {
  if (!src || src === 'main') return 'Your calendar';
  if (src.startsWith('apple:')) return `Apple Calendar · ${src.slice(6)}`;
  try { return `Feed · ${new URL(src.replace(/…$/, '')).hostname}`; } catch { return 'Calendar feed'; }
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// Course tag at the end of a Canvas title: "LQ23 [MAS3114]" → MAS3114.
const course = (summary = '') => summary.match(/\[([A-Z]{2,4}\s?\d{3,4}[A-Z]?)[^\]]*\]\s*$/)?.[1];

export function EventDetails({ event, vault, today, onClose }: { event: CalEvent | null; vault: string; today: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (event && !d.open) d.showModal();
    if (!event && d.open) d.close();
  }, [event]);

  const e = event;
  const link = safeHref(e?.link); const join = safeHref(e?.join);
  const locIsUrl = !!e?.location && !!safeHref(e.location.trim());
  const tag = course(e?.summary);
  const facts = e ? [
    e.status === 'CANCELLED' && 'Cancelled',
    e.status === 'TENTATIVE' && 'Tentative',
    !e.deadline && !e.busy && e.status !== 'CANCELLED' && 'Shown as free',
    e.recurring && 'Repeats',
    sourceLabel(e.source),
  ].filter(Boolean) as string[] : [];

  return (
    <dialog
      ref={ref} className={s.dialog} aria-labelledby="event-title" onClose={onClose}
      onClick={(ev) => { if (ev.target === ref.current) ref.current.close(); }}
    >
      {e && (
        <div className={s.card}>
          <header className={s.head}>
            {e.deadline && <span className={s.kind}>{tag ? `Assignment · ${tag}` : 'Deadline'}</span>}
            <h2 id="event-title">{e.summary || 'Untitled'}</h2>
            <p className={s.when}>{when(e)}</p>
            <button type="button" className={s.close} onClick={() => ref.current?.close()} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>

          <dl className={s.facts}>
            {e.location && !locIsUrl && <div><dt>Where</dt><dd>{e.location}</dd></div>}
            {(join || link || locIsUrl) && (
              <div><dt>Links</dt><dd className={s.links}>
                {join && <a href={join} target="_blank" rel="noreferrer" className={s.primary}>Join call · {host(join)}</a>}
                {link && <a href={link} target="_blank" rel="noreferrer">{e.deadline ? 'Open assignment' : 'Open event'} · {host(link)}</a>}
                {locIsUrl && !join && safeHref(e.location!.trim()) !== link && <a href={safeHref(e.location!.trim())!} target="_blank" rel="noreferrer">{host(e.location!)}</a>}
              </dd></div>
            )}
            {e.meeting && (
              <div><dt>Notes</dt><dd>
                <a href={obsidian(vault, e.meeting.path)}>{e.meeting.title}</a>
                {e.meeting.status && <span className={s.muted}> · {e.meeting.status === 'prep' ? 'prepped' : e.meeting.status}</span>}
              </dd></div>
            )}
            {e.tasks && e.tasks.length > 0 && (
              <div><dt>Tasks</dt><dd>
                <ul className={s.tasks}>
                  {e.tasks.map((t) => (
                    <li key={t.path}>
                      <a href={obsidian(vault, t.path)}>{t.title}</a>
                      {t.due && <span className={s.muted} data-late={t.due < today || undefined}> · due {relativeDay(t.due, today)}</span>}
                    </li>
                  ))}
                </ul>
              </dd></div>
            )}
            <div><dt>Calendar</dt><dd className={s.muted}>{facts.join(' · ')}</dd></div>
          </dl>

          {e.description && (
            <div className={s.desc}>
              {e.description.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para.split('\n').map((ln, j) => <span key={j}>{j > 0 && <br />}<Inline text={ln} vault={vault} /></span>)}</p>
              ))}
            </div>
          )}

          {!e.meeting && !e.deadline && !e.allDay && (
            <p className={s.hint}>Ask Claude to “prep for {e.summary || 'this meeting'}” to get an agenda and a notes page here.</p>
          )}
        </div>
      )}
    </dialog>
  );
}
