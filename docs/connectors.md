# Switching the calendar connectors on

The app works without these. The Calendar page says connecting is not set up and
offers the `.ics` import instead. Adding them is what turns a one-off file
upload into an account that keeps reading itself.

Each provider is independent — set up Microsoft on its own if that is all your
users have.

Everything below produces two values, a **client ID** and a **client secret**,
which go into GitHub repository secrets at
`github.com/<you>/PEDR/settings/secrets/actions`. Nothing else is needed: the
deploy workflow pushes them to Vercel, and generates the encryption key that
protects stored tokens on its own.

---

## Microsoft 365 — Outlook and Teams

The one that matters for UK practice.

1. Go to **portal.azure.com** → **Microsoft Entra ID** → **App registrations** →
   **New registration**.
2. **Name**: whatever you want users to see on the consent screen. They will read
   it, so use the product name, not a codename.
3. **Supported account types**: *Accounts in any organizational directory and
   personal Microsoft accounts*. Anything narrower and only your own tenant can
   connect.
4. **Redirect URI**: platform **Web**, value:

   ```
   https://<your domain>/api/connect/microsoft/callback
   ```

   It must match exactly, including `https` and no trailing slash. Add a second
   one for `http://localhost:3000/...` if you want to test locally.
5. Register. Copy the **Application (client) ID** → this is `MICROSOFT_CLIENT_ID`.
6. **Certificates & secrets** → **New client secret** → copy the **Value**
   (not the Secret ID) → this is `MICROSOFT_CLIENT_SECRET`.

   Microsoft caps secrets at 24 months. Put the expiry in your calendar — when it
   lapses every connection stops refreshing and users are asked to reconnect.
7. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions**:

   | Permission | Why |
   |---|---|
   | `Calendars.Read` | the events themselves |
   | `MailboxSettings.Read` | the mailbox time zone, so a 09:00 meeting lands on the right day |
   | `offline_access` | the refresh token, without which the connection dies in an hour |
   | `openid`, `profile`, `email` | which account was connected, to show it back |

   Delegated, never Application. Application permissions would let this app read
   every calendar in the tenant; delegated means it can only ever read the
   calendar of the person who clicked Connect.

Many practices have admin consent switched on, so the first user to connect will
see "needs admin approval". That is their IT department's call, not a bug.

---

## Google Calendar

1. Go to **console.cloud.google.com** → create a project.
2. **APIs & Services** → **Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → **External** → fill in the app name, support email
   and developer email.
4. **Scopes** → add `.../auth/calendar.events.readonly`, plus `openid`, `email`
   and `profile`.
5. **Credentials** → **Create credentials** → **OAuth client ID** → **Web
   application**.
   - **Authorised redirect URI**:

     ```
     https://<your domain>/api/connect/google/callback
     ```
6. Copy the client ID and client secret → `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

While the consent screen is in **Testing**, only accounts you list as test users
can connect, and their refresh tokens expire after seven days. Publishing needs
Google's verification because a calendar scope is sensitive; expect to supply a
privacy policy and a demo video. Until then the connector works, but only for
the handful of accounts you have added.

---

## What the deploy does with them

Set the four secrets and push. The workflow:

- pushes the client credentials to Vercel for production and preview
- generates `ENCRYPTION_KEY` **once**, the first time it is missing, and never
  touches it again — rotating it would make every stored calendar token
  impossible to decrypt
- generates `CRON_SECRET` the same way, so the scheduled sync cannot be
  triggered by anyone who finds the URL

---

## How it behaves once connected

- **First read happens immediately**, so the screen you land on has something on
  it. It reaches back to your experience start date, or six months, whichever is
  shorter — capped at thirty months so connecting an old account is not
  thousands of requests.
- **Changes arrive by push.** Both providers notify this app when a calendar
  changes. Google's channel lasts a week, Microsoft's just under three days.
- **The hourly job is the safety net**, not the mechanism. It renews
  subscriptions before they lapse and syncs anything not read in six hours, so a
  dropped notification costs you an hour, not a month.
- **Every sync is incremental.** Each provider hands back a cursor, so the second
  read costs one small request rather than a year of events. When a cursor goes
  stale the provider says so and the window is walked again from scratch.
- **Nothing lands verified.** The `.ics` import marks entries verified because
  somebody just looked at them on screen and pressed save. A background sync has
  had no such moment, so everything it adds waits in Review.
- **Cancellations subtract.** A meeting deleted from the calendar takes its
  entry back off the record — but only if the entry is still unverified. Once
  you have confirmed an entry it is yours, and a calendar edit months later does
  not get to rewrite what you said you did.
- **A revoked connection switches itself off** rather than retrying forever, and
  says so on the Calendar page.
