# Family Portal — Full Launch Guide

Everything to take the portal from the zip to a live site your family logs into.
Three stages: **(1)** put it online, **(2)** turn on real logins + shared data, **(3)** turn on
email/app reminders. There's also a section for running **several main families** from one site.

Files in the package (deploy the whole folder — keep them together):

```
index.html   vendor2.bundle.js   sw.js   manifest.webmanifest   icon.svg
schema.sql   supabase/functions/send-reminders/index.ts   (setup files: *.md)
```

`vendor2.bundle.js` powers the calendar PDF/PNG downloads — include it.

---

## Stage 1 — Put it online (≈10 min, free)

1. **Try it first.** Double-click `index.html`. Sign in `admin` / `1234` to look around.
   (Demo logins work only in this local file and disappear once you connect a database.)
2. **Publish (pick one, free):**
   - **GitHub Pages** — see `GITHUB.md` for the click-by-click.
   - **Cloudflare Pages** — dash.cloudflare.com → Workers & Pages → Create → Pages → Upload
     assets → drag the folder → Deploy.
   - **Netlify** — app.netlify.com/drop → drag the folder.

You now have a live `https://…` link. Families can view it. To let them log in and edit, do Stage 2.

---

## Stage 2 — Real logins + shared data (≈15 min, free)

The portal is **one big family**: each immediate family logs in and can view **and edit** everyone's
info (add their kids, dates, photos, etc.). There's one **admin** (you) over the whole family.

1. **Create a free database** at **supabase.com → New project** (save the DB password; wait ~2 min).
2. **Build the tables** — Supabase **SQL Editor → New query**, paste all of `schema.sql`, **Run**.
3. **Simplest sign-up** — Authentication → Providers → Email → turn **off** "Confirm email".
4. **Connect the site** — Supabase **Project Settings → API**. Copy **Project URL** + **anon public** key.
   In `index.html` set:
   ```js
   const SUPABASE_URL      = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'your-anon-public-key';
   ```
   Save and re-upload the folder.
5. **Make yourself the admin** — open the live site → **Create an account** (your email + password).
   Then in Supabase **SQL Editor**:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Refresh — you now have the **Admin** tab.
6. **Add the families** — **Admin → + Add family** (or **Directory → + Add family**) for each household.
   Send everyone the link; each family clicks **Create an account**, signs up, and picks their household
   on first login. From then on everyone can view and edit, and gets reminders.

### Logins (demo mode only)
If you stay in the no-database demo, family logins are **username + PIN**. The usual convention is
**username = family name**, **PIN = phone number** (minimum 4 digits). Set these in **Admin → + Add family**.

---

## Stage 3 — Reminders: emails, app push, browser (optional)

How reminders work now:
- **On the day of an event**, the **immediate family** gets a **celebration email** (birthday,
  anniversary, milestone) or a yahrzeit note.
- **Once a week**, **everyone** gets an email listing that week's events (if any).
- **Browser popups** work with no setup — click the **🔔** in the top bar.
- Each family chooses its channels in **My Household → Edit contact → Notifications**.
- **Admins can edit every email's wording** in **Admin → Email templates** (placeholders
  `{name} {family} {date} {hebrew}`).

To switch on the emails + app push (all free):

1. **Push keys** (on your computer): `npx web-push generate-vapid-keys`. Copy both.
2. In `index.html`: `const VAPID_PUBLIC_KEY = 'your-public-key';` and re-upload.
3. **Free email sender** — sign up at **resend.com**, create an API key.
4. **Deploy the function** (free Supabase CLI):
   ```
   supabase functions deploy send-reminders --no-verify-jwt
   supabase secrets set SB_URL=https://YOUR.supabase.co
   supabase secrets set SB_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   supabase secrets set RESEND_API_KEY=YOUR_RESEND_KEY
   supabase secrets set RESEND_FROM="Family Portal <reminders@yourdomain.com>"
   supabase secrets set VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY
   supabase secrets set VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY
   supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
   # optional: which weekday sends the digest (0 = Sunday)
   supabase secrets set DIGEST_DOW=0
   ```
5. **Run it daily** — Supabase **SQL Editor** (enable `pg_cron` + `pg_net` under Database → Extensions):
   ```sql
   select cron.schedule('daily-reminders', '0 12 * * *', $$
     select net.http_post(
       url:='https://YOUR.supabase.co/functions/v1/send-reminders',
       headers:='{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
   $$);
   ```
   Each morning it sends day-of celebrations, and on the digest day it emails everyone the week ahead
   (no duplicates).

---

## Custom domain(s)

- **Cloudflare Pages** → your project → **Custom domains** → add each domain. Free; you can attach
  many domains to one deployment.
- **GitHub Pages** supports **one** custom domain per site (Settings → Pages → Custom domain).

---

## Running SEVERAL main families (no duplication)

You want more than one **main family** (mishpocha) — each with its own admin and members — but you
**don't** want to copy the whole app for each (that would make updates a nightmare). The design:

- **One deployment** (one repo / one upload) serves them all → you update the code **once**.
- **Each main family gets its own free Supabase project** → its data, its admin, its members stay
  separate and private.
- **You are the master admin** — you own every Supabase project, so you can manage all of them.
- **Each main family** has its own **admin** (its `is_admin` user) — the "sub-admin".
- **Every immediate family** inside a main family has its **own user account**.

Set it up:

1. Do Stage 2 once per main family — one Supabase project each, run `schema.sql`, and set that
   family's admin with the SQL in Stage 2 step 5.
2. Give each main family its own domain (or subdomain).
3. In `index.html`, fill the **`SITES`** map near the top:
   ```js
   const SITES = {
     'cohenfamily.com':    { url:'https://AAA.supabase.co', key:'anon-public-key-AAA' },
     'friedmanfamily.com': { url:'https://BBB.supabase.co', key:'anon-public-key-BBB' },
   };
   ```
4. Point both domains at the **same** deployment. The site automatically uses the right database
   based on the domain the visitor came in on.

That's it: one codebase, many main families, clean separate data, and you over all of them.

> Want a single login where **you** switch between all main families inside the app (one shared
> database with a tenant layer) instead of separate projects? That's a bigger build — tell me and
> I'll add it. For most families the setup above is simpler, free, and keeps each family's data
> fully separate.

---

## Quick checklist

- [ ] Try `index.html` locally (`admin` / `1234`)
- [ ] Upload the whole folder to GitHub Pages / Cloudflare / Netlify
- [ ] Supabase project → run `schema.sql` → turn off email confirmation
- [ ] Paste URL + anon key into `index.html`, re-upload
- [ ] Sign up, make yourself admin, add families
- [ ] (Optional) deploy `send-reminders` + schedule for emails/app-push
- [ ] (Optional) attach custom domain(s)
- [ ] (Multiple main families) one Supabase each + fill the `SITES` map

Deeper detail and troubleshooting: **SETUP.md**. GitHub specifics: **GITHUB.md**.
