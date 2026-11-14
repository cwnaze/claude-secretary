import type { CalEvent, HomeData } from '@/lib/types';
import { clockAmPm, dayTitle, hourLabel, isoWeek, minutesOf, range } from '@/lib/time';
import s from './DayPage.module.css';

interface Placed { e: CalEvent; start: number; end: number; lane: number; lanes: number }

// Side-by-side lanes for overlapping events: each cluster of overlaps splits its width evenly.
function place(events: CalEvent[]): Placed[] {
  const items = events
    .map((e) => ({ e, start: minutesOf(e.start), end: Math.max(minutesOf(e.start) + 15, e.end.slice(0, 10) > e.start.slice(0, 10) ? 1440 : minutesOf(e.end)) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let cluster: Placed[] = []; let clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((p) => p.lane)) + 1; cluster.forEach((p) => (p.lanes = n)); out.push(...cluster); cluster = []; };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((p) => p.end > it.start).map((p) => p.lane));
    let lane = 0; while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

// Longest stretch of at least 45 minutes inside work hours with nothing busy (and, today, not already gone).
function longestFree(placed: Placed[], from: number, to: number): { start: number; end: number } | null {
  const busy = placed.filter((p) => p.e.busy).map((p) => [p.start, p.end] as const).sort((a, b) => a[0] - b[0]);
  let best: { start: number; end: number } | null = null; let cur = from;
  for (const [a, b] of [...busy, [to, to] as const]) {
    const end = Math.min(a, to);
    if (end - cur >= 45 && (!best || end - cur > best.end - best.start)) best = { start: cur, end };
    cur = Math.max(cur, b);
    if (cur >= to) break;
  }
  return best;
}

const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} m`);

export function DayPage({ data, today, nowMin, onStep, onToday, onOpen }: {
  data: HomeData; today: string; nowMin: number;
  onStep: (days: number) => void; onToday: () => void; onOpen: (e: CalEvent) => void;
}) {
  const isToday = data.date === today;
  const isPast = data.date < today;
  const deadlines = data.events.filter((e) => e.deadline && e.due).sort((a, b) => a.due!.localeCompare(b.due!) || (a.summary || '').localeCompare(b.summary || ''));
  const allDay = data.events.filter((e) => e.allDay && !e.deadline);
  const placed = place(data.events.filter((e) => !e.allDay && !e.deadline));
  const workStart = minutesOf(`0000-00-00T${data.work_start || '09:00'}`);
  const workEnd = minutesOf(`0000-00-00T${data.work_end || '17:00'}`);
  const first = Math.min(Math.floor(workStart / 60) - 1, ...placed.map((p) => Math.floor(p.start / 60)));
  const last = Math.max(Math.ceil(workEnd / 60) + 2, ...placed.map((p) => Math.ceil(p.end / 60)));
  const h0 = Math.max(0, first); const h1 = Math.min(24, last);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const free = isPast ? null : longestFree(placed, isToday ? Math.max(workStart, Math.ceil(nowMin / 15) * 15) : workStart, workEnd);
  const y = (min: number) => `calc(${(min - h0 * 60) / 60} * var(--hour-h))`;
  const gone = (end: number) => isPast || (isToday && end <= nowMin);
  const count = data.events.length - deadlines.length;
  const dueGone = (e: CalEvent) => isPast || (isToday && e.due!.slice(0, 10) === today && minutesOf(e.due!) <= nowMin);
  const marks = deadlines.filter((e) => e.due!.slice(0, 10) === data.date && !e.allDay && minutesOf(e.due!) >= h0 * 60 && minutesOf(e.due!) < h1 * 60);

  return (
    <section className={s.day} aria-labelledby="day-title">
      <div className={s.head}>
        <h1 id="day-title">{dayTitle(data.date)}</h1>
        <p className={s.meta}>
          Week {isoWeek(data.date)} · {count === 0 ? 'nothing scheduled' : `${count} ${count === 1 ? 'event' : 'events'}`}
          {deadlines.length > 0 && ` · ${deadlines.length} due`}
          {free && ` · ${duration(free.end - free.start)} open`}
        </p>
        <div className={s.step} role="group" aria-label="Change day">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous day"><Chevron dir="left" /></button>
          <button type="button" onClick={onToday} disabled={isToday}>Today</button>
          <button type="button" onClick={() => onStep(1)} aria-label="Next day"><Chevron dir="right" /></button>
        </div>
      </div>

      {data.calendar_backend === 'connector' && (
        <p className={s.notice}>Your main calendar is a connector, so only your read-only feeds show here. Ask Claude for the full day.</p>
      )}
      {data.calendar_warnings.length > 0 && (
        <ul className={s.notice}>{data.calendar_warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}

      {deadlines.length > 0 && (
        <div className={s.due}>
          <h2>Due{isToday ? ' today' : ''}</h2>
          <ul aria-label="Assignments and deadlines">
            {deadlines.map((e, i) => (
              <li key={`${e.uid ?? i}-${e.due}`} data-past={dueGone(e) || undefined}>
                <button type="button" onClick={() => onOpen(e)} aria-haspopup="dialog">
                  <time dateTime={e.due}>{clockAmPm(minutesOf(e.due!))}</time>
                  <span>{e.summary || 'Untitled'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allDay.length > 0 && (
        <ul className={s.allDay} aria-label="All day">
          {allDay.map((e, i) => (
            <li key={e.uid ?? i}>
              <button type="button" onClick={() => onOpen(e)} aria-haspopup="dialog"><span>All day</span>{e.summary || 'Untitled'}</button>
            </li>
          ))}
        </ul>
      )}

      <div className={s.hours} style={{ height: `calc(${hours.length} * var(--hour-h))` }}>
        {hours.map((h) => (
          <div key={h} className={s.hr} data-past={gone((h + 1) * 60) || undefined} aria-hidden="true"><span>{hourLabel(h)}</span></div>
        ))}

        <ol className={s.events} aria-label="Timed events">
          {placed.map(({ e, start, end, lane, lanes }, i) => {
            const short = end - start < 55;
            return (
              <li
                key={e.uid ? `${e.uid}-${e.start}` : i}
                className={s.ev}
                data-past={gone(end) || undefined}
                data-free-time={!e.busy || undefined}
                data-cancelled={e.status === 'CANCELLED' || undefined}
                data-short={short || undefined}
                style={{ top: y(start), height: `calc(${(end - start) / 60} * var(--hour-h) - 3px)`, left: `calc(var(--gutter) + (100% - var(--gutter)) * ${lane / lanes})`, width: `calc((100% - var(--gutter)) / ${lanes} - 4px)` }}
              >
                <button type="button" onClick={() => onOpen(e)} aria-haspopup="dialog">
                  <b>{e.summary || 'Untitled'}</b>
                  <small>{range(start, end)}<span className={s.loc}>{e.location && ` · ${e.location}`}{e.source && e.source !== 'main' && ' · feed'}</span></small>
                </button>
              </li>
            );
          })}
        </ol>

        {marks.map((e, i) => (
          <button
            key={`m-${e.uid ?? i}`} type="button" className={s.dueMark} data-past={dueGone(e) || undefined}
            style={{ top: y(minutesOf(e.due!)) }} onClick={() => onOpen(e)} aria-haspopup="dialog"
          >
            <span><i>Due {clockAmPm(minutesOf(e.due!))}</i>{e.summary || 'Untitled'}</span>
          </button>
        ))}

        {free && (
          <div className={s.free} style={{ top: y(free.start), height: `calc(${(free.end - free.start) / 60} * var(--hour-h) - 3px)` }}>
            <b>Open · {range(free.start, free.end)}</b>
            {free.end - free.start >= 75 && <small>Longest free stretch in your work hours</small>}
          </div>
        )}

        {count === 0 && !free && marks.length === 0 && <p className={s.empty}>Nothing on the calendar.</p>}

        {isToday && nowMin >= h0 * 60 && nowMin < h1 * 60 && (
          <div className={s.ribbon} style={{ top: y(nowMin) }} role="img" aria-label={`Now, ${clockAmPm(nowMin)}`}>
            <i aria-hidden="true">Now {clockAmPm(nowMin)}</i>
          </div>
        )}
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  );
}
