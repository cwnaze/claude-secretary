import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Follow-ups · Secretary' };

export default function Page() {
  return <Pending href="/follow-ups" title="Follow-ups" where="Your follow-ups are notes in the Follow-ups folder of your vault." />;
}
