NETLIFY PUSH REMINDER SETUP

Add these environment variables in Netlify:

SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY
SITE_URL

Suggested SITE_URL:
https://magenta-conkies-88e9da.netlify.app

After deploying:
1. Open Netlify > Functions.
2. Select check-reminders.
3. Confirm it has a Scheduled badge.
4. Use Run now to test the function.
5. Review the function log.

The function runs once every minute and sends reminders to the OneSignal
"Subscribed Users" segment. The browser's repeating reminder timer is disabled
to prevent duplicate pushes.
