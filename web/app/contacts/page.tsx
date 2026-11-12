import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Contacts · Secretary' };

export default function Page() {
  return <Pending href="/contacts" title="Contacts" where="Your contacts are notes in the People folder of your vault." />;
}
