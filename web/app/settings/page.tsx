import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Settings · Secretary' };

export default function Page() {
  return <Pending href="/settings" title="Settings" where="Until it is, edit Settings.md in your vault or run /secretary:setup in Claude Code." />;
}
