# Launching Your Family Portal — Step by Step

Two stages. **Stage 1** puts a working site online in ~10 minutes (families view everything).
**Stage 2** turns on real logins, per-family editing, and reminders. Do Stage 1 first; add
Stage 2 whenever you're ready.

---

## Stage 1 — Get it online (≈10 min, free)

**1. Unzip the folder.** Keep all files together:
`index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` (and the `supabase` folder for later).

**2. Try it locally first.** Double-click `index.html`. Sign in with `admin` / `1234` to look
around. (These demo logins work only in this local file; they disappear once you go live in
Stage 2.)

**3. Put it online (pick one, all free):**
   - **Cloudflare Pages** (recommended): sign in at dash.cloudflare.com → **Workers & Pages** →
     **Create → Pages → Upload assets** → drag the folder in → **Deploy**.
   - **Netlify**: go to **app.netlify.com/drop** and drag the folder onto the page.

   You'll get a link like `https://your-portal.pages.dev`. Open it — that's your live site.

**4. (Optional) Add each family's domain.** In your Pages/Netlify project → **Custom domains** →
add `cohenfamily.com`, `friedmanfamily.com`, etc. Each family points their domain's DNS as the
host instructs (one-time). All domains show the same portal. Free — families only pay if they
*register* their own domain name (~$10/yr); free subdomains like `cohen.your-portal.pages.dev`
cost nothing.

At this point the portal is live. To let families log in and edit their own info, do Stage 2.

---

## Stage 2 — Real logins + shared data (≈15 min, free)

**1. Create a free database.** Go to **supabase.com** → **New project** (pick a name + password,
wait ~2 min).

**2. Build the tables.** In Supabase: **SQL Editor → New query** → open `schema.sql`, copy all,
paste, **Run**. Look for "Success."

**3. Turn off email confirmation (easiest).** **Authentication → Providers → Email** → turn off
**Confirm email**. (Optional — leave on for extra security.)

**4. Connect the site to the database.** Supabase: **Project Settings → API**. Copy the
**Project URL** and the **anon public** key. Open `index.html` in a text editor and fill in:
```js
const SUPABASE_URL      = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key';
```
Save. Re-upload the folder to your host (drag it in again to replace).

**5. Make yourself the admin.** Open your live site → **Create an account** → sign up with your
email + a password. Then in Supabase **SQL Editor**, run (with your email):
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```
Refresh the site — you now have the **Admin** tab.

**6. Add the families.** **Admin → + Add family** for each household. Send each family your site
link; they click **Create an account**, sign up, and pick their household on first login. From
then on each family edits only their own info; everyone sees the shared directory and calendar.

Your portal is fully live. Reminders below are optional.

---

## Stage 3 — Reminders (optional; browser popups already work)

Browser popups work now — anyone clicks the **🔔** in the top bar and allows notifications.
For **email** and **app push when the app is closed**, set up the included function:

**1. Make push keys.** On your computer: `npx web-push generate-vapid-keys`. Copy both keys.

**2. Add the public key to the site.** In `index.html`: `const VAPID_PUBLIC_KEY = 'your-public-key';`
Re-upload the folder.

**3. Free email sender.** Sign up at **resend.com**, create an API key.

**4. Deploy the function** (free Supabase CLI):
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

**5. Run it daily.** Supabase **SQL Editor** (enable `pg_cron` + `pg_net` under Database →
Extensions first):
```sql
select cron.schedule('daily-reminders', '0 12 * * *', $$
  select net.http_post(
    url:='https://YOUR.supabase.co/functions/v1/send-reminders',
    headers:='{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
$$);
```

Each morning it sends any email/push reminders due, with no duplicates.

---

## Quick checklist

- [ ] Unzip, open `index.html`, try `admin` / `1234`
- [ ] Upload folder to Cloudflare Pages / Netlify → live link
- [ ] (Optional) attach each family's custom domain
- [ ] Supabase project → run `schema.sql`
- [ ] Paste URL + anon key into `index.html`, re-upload
- [ ] Sign up, make yourself admin, add families
- [ ] (Optional) deploy `send-reminders` + schedule for email/app-push

Full details and troubleshooting are in **SETUP.md**.
