import type { Metadata } from 'next';
import { Pending } from '@/components/Pending';

export const metadata: Metadata = { title: 'Expenses · Secretary' };

export default function Page() {
  return <Pending href="/expenses" title="Expenses" where="Expenses, invoices and your budget are in the Expenses folder of your vault." />;
}
