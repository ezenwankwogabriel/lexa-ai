import cron from 'node-cron';
import { pool } from '../db/client';

interface DueUser {
  id: string;
  push_token: string;
  input_normalised: string;
  created_at: Date;
}

async function sendReminders() {
  const currentHour = new Date().getUTCHours();

  // Users with a due review, no review submitted today, and matching notification hour
  const { rows: users } = await pool.query<DueUser>(`
    SELECT
      u.id,
      u.push_token,
      rq.input_normalised,
      rq.created_at
    FROM users u
    JOIN LATERAL (
      SELECT input_normalised, created_at
      FROM review_queue
      WHERE user_id = u.id
        AND next_review_at <= now()
      ORDER BY next_review_at ASC
      LIMIT 1
    ) rq ON true
    WHERE u.push_token IS NOT NULL
      AND u.notification_enabled = true
      AND u.notification_hour = $1
      AND u.id NOT IN (
        SELECT DISTINCT user_id
        FROM review_queue
        WHERE updated_at >= now()::date
      )
  `, [currentHour]);

  if (users.length === 0) return;

  const messages = users.map((user) => {
    const daysSince = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / 86_400_000
    );
    return {
      to: user.push_token,
      sound: 'default',
      title: 'Time to practise',
      body: `You searched "${user.input_normalised}" ${daysSince} day${daysSince !== 1 ? 's' : ''} ago. Still remember it?`,
    };
  });

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    console.error('[reviewReminder] Expo Push API error:', await res.text());
  }
}

export function startReviewReminderJob() {
  // Run every hour on the hour; filters by each user's notification_hour
  cron.schedule('0 * * * *', () => {
    sendReminders().catch((err) => console.error('[reviewReminder]', err));
  });
}
