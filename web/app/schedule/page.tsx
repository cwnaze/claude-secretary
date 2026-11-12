import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Schedule · Secretary' };

export default function Page() {
  return <Pending href="/schedule" title="Schedule" where="Ask Claude what's on this week, or check your calendar file." />;
}
