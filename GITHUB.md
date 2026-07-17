# Launch on GitHub Pages — step by step

You have two ways to publish. **Path A (web upload)** needs no tools — just a browser.
**Path B (git)** is for if you're comfortable with the command line. Either gets you a free
`https://…github.io/…` link with automatic HTTPS.

> One thing to know up front: **GitHub Pages allows only one custom domain per site.** So a
> *separate custom domain for each family* isn't a natural fit on GitHub. Options:
> (1) launch on GitHub now with the free `github.io` link (or one custom domain for the whole
> portal), or (2) if per-family domains matter, use **Cloudflare Pages** instead, which lets you
> attach many domains to one deployment. You can start on GitHub and move later — the files are
> identical. See "Custom domains" at the bottom.

---

## Path A — Upload in the browser (easiest, ~5 min)

1. **Make an account / sign in** at **github.com**.
2. Click the **+** (top-right) → **New repository**.
   - **Repository name:** e.g. `family-portal`
   - Set it to **Public** (free GitHub Pages requires public, unless you have GitHub Pro).
   - Leave everything else default → **Create repository**.
3. On the new repo page, click **uploading an existing file** (the link in the "Quick setup" box).
4. **Drag in the contents** of the `family-portal` folder — the individual files
   (`index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `.nojekyll`, the `.md` files) and
   the `supabase` folder. (Drag the *files*, not a zip.)
5. Click **Commit changes**.
6. Go to **Settings → Pages** (left sidebar).
   - Under **Build and deployment → Source**, choose **Deploy from a branch**.
   - **Branch:** `main`, **Folder:** `/ (root)` → **Save**.
7. Wait ~1 minute, refresh the Pages screen. It shows:
   **"Your site is live at `https://YOUR-USERNAME.github.io/family-portal/`"**. Open it — done.

That link is your portal. Share it with the family.

---

## Path B — Git command line

I've already created a ready-to-push repo for you inside `ghrepo/` (committed on branch `main`).
From that folder, after creating an **empty** repo on github.com (no README), run:

```bash
git remote add origin https://github.com/YOUR-USERNAME/family-portal.git
git push -u origin main
```

Then do **step 6–7** above (Settings → Pages → Deploy from branch → `main` / root).

If you'd rather start fresh in any folder that has the site files:
```bash
git init
git branch -M main
git add -A
git commit -m "Family Portal"
git remote add origin https://github.com/YOUR-USERNAME/family-portal.git
git push -u origin main
```

---

## After it's live

- **It works immediately in view mode** (families can browse; browser-popup reminders work).
- **To enable real logins + reminders**, follow `LAUNCH.md` **Stage 2** (create a free Supabase
  project, run `schema.sql`, paste two keys into `index.html`, re-commit/re-upload). On GitHub
  the "re-upload" is just: edit the file and commit again, or `git add -A && git commit && git push`.

## Updating the site later
- **Web:** open the file on GitHub → pencil ✏️ icon → edit → **Commit**. Or **Add file → Upload**
  to replace files. Pages redeploys automatically in ~1 min.
- **Git:** `git add -A && git commit -m "update" && git push`.

## Custom domains
- **One domain for the whole portal (supported):** Settings → Pages → **Custom domain**, enter it,
  and add the DNS records GitHub shows at your registrar. GitHub adds a `CNAME` file automatically.
- **A different domain per family (not supported on one GitHub Pages site):** either create one
  repo per family (each with its own `CNAME`), or host on **Cloudflare Pages**, which attaches
  many custom domains to a single deployment. The site files are the same either way.
