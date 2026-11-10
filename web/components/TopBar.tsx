import Link from 'next/link';
import s from './TopBar.module.css';

export const SECTIONS = [
  { href: '/', label: 'Briefing' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/settings', label: 'Settings' },
] as const;

export type Counts = Partial<Record<(typeof SECTIONS)[number]['href'], { n: number; label: string }>>;

export function TopBar({ current, counts = {}, vault }: { current: string; counts?: Counts; vault?: string }) {
  return (
    <header className={s.bar}>
      <Link href="/" className={s.brand}>Secretary</Link>
      <nav aria-label="Sections" className={s.nav}>
        {SECTIONS.map(({ href, label }) => {
          const c = counts[href];
          return (
            <Link key={href} href={href} className={s.link} aria-current={current === href ? 'page' : undefined}>
              {label}
              {c && c.n > 0 && <span className={s.count} aria-label={c.label}>{c.n}</span>}
            </Link>
          );
        })}
      </nav>
      {vault && <span className={s.vault} title="Everything here is read from this vault">Vault: {vault}</span>}
    </header>
  );
}
