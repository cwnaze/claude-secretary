'use client';

import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { DayPage } from '@/components/DayPage';
import { DayNotes } from '@/components/DayNotes';
import { Message } from '@/components/Message';
import { useHome } from '@/lib/useHome';
import { addDays, minutesOf } from '@/lib/time';
import s from './page.module.css';

// The selected day lives in ?date= so a reload or a bookmark keeps it.
function readDate(): string | null {
  const d = new URLSearchParams(window.location.search).get('date');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export default function Home() {
  const [date, setDate] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setDate(readDate()); setReady(true); }, []);
  const state = useHome(ready ? date : null);

  const go = useCallback((d: string | null) => {
    setDate(d);
    window.history.replaceState(null, '', d ? `/?date=${d}` : '/');
  }, []);

  if (state.status === 'not_set_up') {
    return (
      <>
        <TopBar current="/" />
        <Message title="Secretary isn't set up yet">
          <p>Run <code>/secretary:setup</code> in Claude Code, or <code>npx claude-secretary init</code> in a terminal, then reload this page.</p>
        </Message>
      </>
    );
  }
  if (state.status === 'offline') {
    return (
      <>
        <TopBar current="/" />
        <Message title="Can't reach your vault">
          <p>The dashboard server stopped answering. Start it again with <code>sec ui</code>, then reload.</p>
        </Message>
      </>
    );
  }
  if (state.status === 'loading') {
    return (
      <>
        <TopBar current="/" />
        <main className={s.main} aria-busy="true"><div className={s.loading} aria-label="Loading your day" /></main>
      </>
    );
  }

  const { data } = state;
  const today = data.now.slice(0, 10);
  const nowMin = minutesOf(data.now);
  const counts = {
    '/inbox': { n: data.drafts.length + data.blocked.length, label: `${data.drafts.length} drafts, ${data.blocked.length} blocked` },
    '/follow-ups': { n: data.followups.due.length, label: `${data.followups.due.length} due` },
  };

  return (
    <>
      <TopBar current="/" counts={counts} vault={`${data.vault} / ${data.root}`} />
      <main className={s.main}>
        <DayPage
          data={data} today={today} nowMin={nowMin}
          onStep={(n) => go(addDays(data.date, n) === today ? null : addDays(data.date, n))}
          onToday={() => go(null)}
        />
        <DayNotes data={data} today={today} />
      </main>
    </>
  );
}
