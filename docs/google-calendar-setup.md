# Google Calendar setup

MentorLoop uses the existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment values for optional Calendar access. If they are absent, the API still starts and users can book with HTTPS meeting links and download `.ics` files.

For local development, add this exact authorized redirect URI to the OAuth client's Web application configuration:

```text
http://localhost:4000/calendar/google/callback
```

The value must match `API_URL` plus `/calendar/google/callback` in the API environment. The consent request asks only for `https://www.googleapis.com/auth/calendar.events`, and users opt in by selecting **Connect Google Calendar**. Events are created only when a participant selects **Add to Google Calendar** on a session. Tokens are encrypted at rest; disconnecting removes the stored refresh token. A user can always use the HTTPS meeting link and calendar file without connecting Google.
