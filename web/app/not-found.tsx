import { TopBar } from '@/components/TopBar';
import { Message } from '@/components/Message';

export default function NotFound() {
  return (
    <>
      <TopBar current="" />
      <Message title="No page here">
        <p><a href="/">Go to today&rsquo;s briefing</a></p>
      </Message>
    </>
  );
}
