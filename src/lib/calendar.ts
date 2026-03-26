// ──────────────────────────────────────────────────────────────────
// src/lib/calendar.ts
//
// RFC 5545 iCalendar helpers for the Deadline Tracker calendar sync.
// Zero dependencies — pure string generation.
//
// PRD Screen 7: "device calendar sync" for deadline tracker
// Gap Analysis Task 5
// ──────────────────────────────────────────────────────────────────

export interface CalendarDeadline {
  id:         string;
  title:      string;
  due_date:   string;   // ISO date string: 'YYYY-MM-DD' or full ISO
  type:       'court' | 'submission' | 'internal';
  case_title: string;
  case_id:    string;
  jurisdiction?: string;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Escape special chars for iCal TEXT values */
function icsEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n');
}

/** Format a JS Date as iCal DATE: YYYYMMDD */
function icsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Format a JS Date as iCal DATETIME: YYYYMMDDTHHmmssZ */
function icsDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Generate a stable UID from a deadline ID */
function makeUID(deadlineId: string): string {
  return `deadline-${deadlineId}@wakeela.com`;
}

// ── Type labels ───────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  court:      'Court Hearing',
  submission: 'Submission Deadline',
  internal:   'Internal Reminder',
};

// ── Single event ──────────────────────────────────────────────────

/**
 * Generate a complete .ics file string for a single deadline.
 * Returns the full VCALENDAR wrapping one VEVENT.
 */
export function generateICS(
  dl: CalendarDeadline,
  appUrl = 'https://wakeela.com'
): string {
  const dueDate = new Date(dl.due_date);
  const now     = new Date();

  const typeLabel = TYPE_LABEL[dl.type] ?? dl.type;
  const summary   = icsEscape(`[${typeLabel}] ${dl.title}`);
  const desc      = icsEscape(
    `Case: ${dl.case_title}\n` +
    (dl.jurisdiction ? `Jurisdiction: ${dl.jurisdiction}\n` : '') +
    `Type: ${typeLabel}\n` +
    `\nManage this deadline: ${appUrl}/en/deadlines`
  );
  const location  = dl.jurisdiction ? icsEscape(dl.jurisdiction) : '';
  const url       = `${appUrl}/en/cases/${dl.case_id}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wakeela//Legal Deadline Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Wakeela Deadlines',
    'X-WR-TIMEZONE:UTC',
    'BEGIN:VEVENT',
    `UID:${makeUID(dl.id)}`,
    `DTSTAMP:${icsDateTime(now)}`,
    `DTSTART;VALUE=DATE:${icsDate(dueDate)}`,
    `DTEND;VALUE=DATE:${icsDate(new Date(dueDate.getTime() + 86_400_000))}`,  // all-day
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    ...(location ? [`LOCATION:${location}`] : []),
    `URL:${url}`,
    'STATUS:CONFIRMED',
    // Alarms: 3 days and 1 day before
    'BEGIN:VALARM',
    'TRIGGER:-P3D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${summary} in 3 days`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${summary} tomorrow`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── Bulk calendar ─────────────────────────────────────────────────

/**
 * Generate a .ics file with multiple events — one per deadline.
 * Used for the "Sync all to calendar" bulk action.
 */
export function generateBulkICS(
  deadlines: CalendarDeadline[],
  calendarName = 'Wakeela — Case Deadlines',
  appUrl = 'https://wakeela.com'
): string {
  const now      = new Date();
  const events   = deadlines.map((dl) => {
    const dueDate   = new Date(dl.due_date);
    const typeLabel = TYPE_LABEL[dl.type] ?? dl.type;
    const summary   = icsEscape(`[${typeLabel}] ${dl.title}`);
    const desc      = icsEscape(
      `Case: ${dl.case_title}\n` +
      (dl.jurisdiction ? `Jurisdiction: ${dl.jurisdiction}\n` : '') +
      `Type: ${typeLabel}\n` +
      `\nManage: ${appUrl}/en/deadlines`
    );
    const location  = dl.jurisdiction ? icsEscape(dl.jurisdiction) : '';
    const url       = `${appUrl}/en/cases/${dl.case_id}`;

    return [
      'BEGIN:VEVENT',
      `UID:${makeUID(dl.id)}`,
      `DTSTAMP:${icsDateTime(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(dueDate)}`,
      `DTEND;VALUE=DATE:${icsDate(new Date(dueDate.getTime() + 86_400_000))}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      ...(location ? [`LOCATION:${location}`] : []),
      `URL:${url}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-P3D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${summary} in 3 days`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${summary} tomorrow`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wakeela//Legal Deadline Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    'X-WR-TIMEZONE:UTC',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── Google Calendar URL builder ───────────────────────────────────

/**
 * Returns a Google Calendar "add event" URL for a single deadline.
 * Opens in browser — no OAuth required.
 */
export function googleCalendarUrl(
  dl: CalendarDeadline,
  appUrl = 'https://wakeela.com'
): string {
  const dueDate  = new Date(dl.due_date);
  const nextDay  = new Date(dueDate.getTime() + 86_400_000);
  const typeLabel = TYPE_LABEL[dl.type] ?? dl.type;

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:T]/g, '').slice(0, 8); // YYYYMMDD for all-day

  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     `[${typeLabel}] ${dl.title}`,
    dates:    `${fmt(dueDate)}/${fmt(nextDay)}`,
    details:  `Case: ${dl.case_title}\n\nManage on Wakeela: ${appUrl}/en/cases/${dl.case_id}`,
    location: dl.jurisdiction ?? '',
    trp:      'false',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
