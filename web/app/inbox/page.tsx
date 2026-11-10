import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Inbox · Secretary' };

export default function Page() {
  return <Pending href="/inbox" title="Inbox" where="Drafts and triage notes are in the Inbox folder of your vault." />;
}
