// Classifies MCP tool calls into the secretary's gated actions and decides
// what a PreToolUse hook should answer. Pure functions; no I/O.

const MAIL_SERVER = /gmail|outlook|e-?mail|mail|imap|smtp|resend|sendgrid|postmark|mailgun|m365|microsoft[-_ ]?365|office[-_ ]?365|fastmail|proton/;
const CAL_SERVER = /calendar|gcal|cal\.com|calendly|outlook|m365|microsoft[-_ ]?365|office[-_ ]?365|fastmail|ical|caldav/;
const MSG_SERVER = /slack|discord|teams|telegram|whatsapp|signal|sms|twilio|imessage|messages|messenger|chat|mattermost|zulip|matrix|linkedin/;

const READ_ONLY = /(^|_)(get|list|search|find|read|fetch|query|lookup|view|show|describe|count|download|export)(_|$)/;
const DRAFT = /draft/;
const SEND = /(^|_)(send|reply|forward|respond|post|publish|dm|message|chat_?post|write_?message|broadcast)(_|$)|sendmessage|postmessage/;
const CAL_WRITE = /(^|_)(create|update|delete|remove|move|patch|insert|modify|cancel|reschedule|respond|accept|decline|quick_?add|add|edit|set)(_|$)/;
const CAL_NOUN = /event|calendar|meeting|invite|invitation|appointment|booking|schedule/;

export function splitToolName(name) {
  const m = String(name || '').match(/^mcp__(.+?)__(.+)$/);
  if (!m) return null;
  return { server: m[1].toLowerCase(), tool: m[2].toLowerCase().replace(/[-\s]/g, '_') };
}

function hasAttendees(input) {
  if (!input || typeof input !== 'object') return false;
  for (const k of ['attendees', 'attendee_emails', 'guests', 'invitees', 'participants', 'requiredAttendees', 'optionalAttendees']) {
    const v = input[k];
    if (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : false) return true;
  }
  if (input.event && typeof input.event === 'object') return hasAttendees(input.event);
  return false;
}

// Returns one of 'send_email' | 'send_invites' | 'manage_calendar' | 'contact_people' | null
export function classify(toolName, toolInput = {}) {
  const p = splitToolName(toolName);
  if (!p) return null;
  const { server, tool } = p;
  if (READ_ONLY.test(tool) && !SEND.test(tool)) return null;
  if (DRAFT.test(tool) && !/send_?draft|draft_?send/.test(tool)) return null; // drafting is always allowed

  // Calendar actions (checked first: Outlook/M365 servers carry both mail and calendar tools)
  if (CAL_SERVER.test(server) || CAL_NOUN.test(tool)) {
    if (CAL_NOUN.test(tool) || CAL_SERVER.test(server) && !MAIL_SERVER.test(server)) {
      if (/respond|accept|decline|rsvp|invite/.test(tool)) return 'send_invites';
      if (CAL_WRITE.test(tool) || SEND.test(tool)) return hasAttendees(toolInput) ? 'send_invites' : 'manage_calendar';
      return null;
    }
  }
  if (MAIL_SERVER.test(server) && SEND.test(tool)) return 'send_email';
  if (MSG_SERVER.test(server) && SEND.test(tool)) return 'contact_people';
  // A generic send on an unknown server whose tool name says email/message
  if (SEND.test(tool) && /mail/.test(tool)) return 'send_email';
  if (SEND.test(tool) && /(^|_)(message|sms|text|dm)(_|$)/.test(tool)) return 'contact_people';
  return null;
}

const LABEL = {
  send_email: 'send an email',
  send_invites: 'send calendar invitations',
  manage_calendar: 'change your calendar',
  contact_people: 'message someone',
};

// level: 'off' | 'ask' | 'auto' | null (config unreadable)
export function decide(action, level) {
  if (!action) return null;
  if (level === 'auto') return null; // defer to the user's normal permission settings
  if (level === 'ask') {
    return {
      permissionDecision: 'ask',
      permissionDecisionReason: `Secretary plugin: permission_${action} is "ask" — approve only if you have reviewed exactly what will be sent or changed.`,
    };
  }
  const why = level === 'off'
    ? `permission_${action} is "off"`
    : 'the secretary settings could not be read, so this is blocked to be safe';
  return {
    permissionDecision: 'deny',
    permissionDecisionReason: `Secretary plugin blocked this: Claude is not allowed to ${LABEL[action]} on your behalf (${why}). Draft it instead and tell the user where the draft is; do not retry with another tool. To change this, edit permission_${action} in Secretary/Settings.md or run /secretary:setup.`,
  };
}
