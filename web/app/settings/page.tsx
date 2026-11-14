import type { Metadata } from 'next';
import { SettingsForm } from '@/components/SettingsForm';

export const metadata: Metadata = { title: 'Settings · Secretary' };

export default function Page() {
  return <SettingsForm />;
}
