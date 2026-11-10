import s from './Message.module.css';

// A full-width page message: setup needed, server down, a section not built yet.
export function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className={s.wrap}>
      <h1>{title}</h1>
      <div className={s.body}>{children}</div>
    </main>
  );
}
