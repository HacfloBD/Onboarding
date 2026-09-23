// Scheduled once a day. Runs a trivial read with the service role so a
// free-tier Supabase project sees activity and is not paused after ~7 idle days.
// Stopgap only: upgrade to Supabase Pro once customers are live (never pauses,
// daily backups). Scheduled functions cannot be called by URL in production.
import { adminClient } from '../lib/supabase-admin.mjs';

export default async () => {
  try {
    const { error } = await adminClient().from('app_settings').select('key').limit(1);
    if (error) throw error;
    console.log('keep-alive ok');
  } catch (e) {
    console.error('keep-alive failed', e.message);
  }
};

export const config = { schedule: '@daily' };
