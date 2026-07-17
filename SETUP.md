# Family Portal — Setup Guide

A self-contained family portal with a combined **Yiddish (Hebrew) + English calendar**,
contacts directory, and per-family logins to track **Yahrzeits, Birthdays, Weddings /
Anniversaries, and Bar/Bat Mitzvah & milestones**.

It's a single file — `index.html` — plus this guide and one SQL file. Everything is free to host.

---

## Two ways to run it

| | **Demo mode** (works right now) | **Live mode** (real portal) |
|---|---|---|
| Setup | none — just open the file | ~10 min, one free Supabase project |
| Logins | one username + PIN per family | each family: own email + password |
| Data | saved in *your* browser only | shared cloud database, everyone sees updates |
| Cost | free | free (Supabase free tier) |

Open `index.html` as-is and it runs in **demo mode** so you can click around.
Demo sign-ins: admin `admin` / PIN `1234`, or family `cohen` / PIN `1111`.

When you're ready for real family logins, do the 5 steps below.

---

## Going live (real logins for every family)

### 1. Create a free Supabase project
- Go to **supabase.com** → sign in → **New project**.
- Pick a name and a database password (save it). Wait ~2 min for it to spin up.

### 2. Create the database
- In the project: **SQL Editor → New query**.
- Open `schema.sql` from this folder, copy everything, paste it in, click **Run**.
- You should see "Success". This creates the tables, security rules, and settings.

### 3. Get your two keys
- **Project Settings → API**.
- Copy **Project URL** and the **anon public** key.
- Open `index.html` in any text editor and paste them near the top:

```js
const SUPABASE_URL      = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...your-anon-key...';
```

Save the file. The sign-in screen will now say **"Live · cloud logins"**.

> The anon key is meant to be public — it's safe in the file. Your data is protected
> by the security rules (Row Level Security) from `schema.sql`, so families can only
> edit their own household.

### 4. Make yourself the admin
- (Optional, easiest) In Supabase: **Authentication → Providers → Email** and turn
  **off** "Confirm email" so sign-ups work instantly. (Leave it on if you prefer email confirmation.)
- Open the portal, click **Create an account**, sign up with your email + a password.
- Back in Supabase: **SQL Editor**, run this with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

- Refresh the portal — you now have the **Admin** tab.

### 5. Add households and invite families
- **Admin tab → + Add family** for each household (Cohen, Friedman, …).
- Send each family the site link. They click **Create an account**, sign up, and on
  first login **pick their household** from the list.
- From then on, each family can log in and edit their own members and dates; everyone
  sees the shared directory and calendar.

---

## Hosting it for free

Deploy the **whole folder** (not just `index.html`) so the app, service worker,
manifest and icon all ship together:

```
index.html   manifest.webmanifest   sw.js   icon.svg
```

Any static host works and all are free:

- **Cloudflare Pages** (recommended) — create a project, upload the folder. Free, fast, and supports many custom domains on one project.
- **Netlify Drop** — go to app.netlify.com/drop and drag the folder in. Instant URL.
- **GitHub Pages** — put the files in a repo, enable Pages.

You get an `https://` link to share. (HTTPS is required for app-install and push notifications — all three provide it automatically.)

### A custom domain for each family

You don't deploy a separate site per family — you attach **several custom domains to the
one deployment**, so every family reaches the same portal at their own address, and each
logs into their own space.

On **Cloudflare Pages**: your project → **Custom domains → Set up a domain**, and add each
family's domain (`cohenfamily.com`, `friedmanfamily.com`, …). Repeat for as many as you like;
there's no per-domain charge from Cloudflare. Each family points their domain's DNS to
Cloudflare (a one-time step Cloudflare walks them through). Netlify works the same way under
**Domain management → Add a custom domain**.

Costs: hosting and the domains-on-one-project are **free**. The only paid piece is each
family *registering* their own domain name (~$10–15/year to a registrar like Cloudflare
Registrar, Namecheap, etc.) — optional, and paid to the registrar, not to the portal.
Prefer free? Use subdomains of one domain you own (`cohen.familyportal.com`) at no cost.

---

## Using the portal

- **Dashboard** — everything coming up in the next 90 days, with the Hebrew date shown.
- **Calendar** — month grid; every day shows the English date and the Hebrew date (in Hebrew
  letters). All observant **holidays** appear automatically, plus your events, colour-coded.
  Jump to any month/year from **75 years back to 20 years ahead**.
- **Events** — a simple form to add yahrzeits, anniversaries, milestones and birthdays. Choose
  **one-time or yearly**, give a name for this year vs. later years (e.g. *Wedding* → *Anniversary*),
  see the **Yiddish + English dates live** as you pick, set **who to remind** and how (🔔 browser,
  📱 app push, ✉️ email), and **add any event — or all of them — to your own calendar** (.ics for
  Google/Apple/Outlook).
- **Directory & Phone Book** — every household and person with phone, cell, email and address.
  Download the whole book to your phone **Contacts** (vCard), one family at a time, or the whole
  thing as a **CSV** spreadsheet.
- **My Household** — the family edits their own members (incl. contact details) and dates.
  Yahrzeits, birthdays and anniversaries repeat by the **Hebrew** date each year (switchable to
  the English date per event).
- **Admin** — manage households, rename the community, export a backup.

### How dates work
You enter the ordinary (English) date something happened — a birth, a wedding, a passing.
The portal converts it to the Hebrew date and, for every year, finds the matching Hebrew
date and shows its English date. Leap-year Adar and 30-day-month edge cases are handled
with the common customs.

---

## Reminders (browser popup, app push, email)

There are three reminder channels. One works with **no setup**; two need the backend.

### 1. Browser popups — works immediately
When someone clicks the **🔔** button in the top bar and allows notifications, the portal
shows a popup for any of their events coming up within the reminder window — while the site
is open in that browser. Nothing to configure.

### 2 & 3. App push (when closed) + Email — need the backend
These are sent by a small scheduled job in your Supabase project.

**a) Generate web-push (VAPID) keys** — run once on your computer (needs Node):
```
npx web-push generate-vapid-keys
```
Copy the **Public Key** and **Private Key** it prints.

**b) Put the public key in the app** — open `index.html` and set:
```js
const VAPID_PUBLIC_KEY = 'your-public-key';
```
Now when a family taps 🔔 (and has "installed" the app — see below), their device subscribes
to push.

**c) Get a free email sender** — sign up at **resend.com** (free tier), create an API key.

**d) Deploy the reminder function** (needs the free Supabase CLI):
```
supabase functions deploy send-reminders --no-verify-jwt
supabase secrets set SB_URL=https://YOUR.supabase.co
supabase secrets set SB_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set RESEND_API_KEY=YOUR_RESEND_KEY
supabase secrets set RESEND_FROM="Family Portal <reminders@yourdomain.com>"
supabase secrets set VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY
supabase secrets set VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
```
(The function code is in `supabase/functions/send-reminders/index.ts`.)

**e) Run it once a day** — in Supabase SQL Editor, schedule it with pg_cron + pg_net
(enable both under Database → Extensions), replacing the URL and key:
```sql
select cron.schedule('daily-reminders', '0 12 * * *', $$
  select net.http_post(
    url:='https://YOUR.supabase.co/functions/v1/send-reminders',
    headers:='{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
$$);
```
That's it — each morning the job emails and pushes any reminders due that day. It logs what
it sends (in `reminder_log`) so nobody gets a duplicate.

### Installing the portal as an app
On phones/tablets, families open the site and choose **Add to Home Screen** (iOS Safari:
Share → Add to Home Screen; Android Chrome: menu → Install app). That makes it a real app icon
and lets push notifications arrive when the app is closed.

## FAQ

**Is it really free?** Yes. The file hosts free anywhere; Supabase's free tier easily
covers a family/community portal.

**Can families only edit their own info?** Yes. The security rules enforce it at the
database level — a family login cannot change another family's data. Admins can edit all.

**How do I add another admin?** Run the same `update ... set is_admin = true` SQL with
that person's email.

**Do I have to use a backend?** No — demo mode needs nothing. But only Live mode lets many
families log in and update a shared portal, which is what you asked for.

**Back up the data?** Admin tab → Export backup (JSON) any time.
