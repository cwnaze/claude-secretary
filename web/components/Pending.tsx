import { TopBar } from './TopBar';
import { Message } from './Message';

// Sections whose views aren't built yet. Each says where that data lives today.
export function Pending({ href, title, where }: { href: string; title: string; where: string }) {
  return (
    <>
      <TopBar current={href} />
      <Message title={title}>
        <p>This view isn&rsquo;t built yet. {where}</p>
        <p><a href="/">Back to today&rsquo;s briefing</a></p>
      </Message>
    </>
  );
}
