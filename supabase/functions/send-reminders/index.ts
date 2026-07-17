// Supabase Edge Function: send-reminders
// Sends EMAIL + WEB PUSH reminders for due events. Runs on a schedule (see SETUP.md).
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
//
// Required function secrets (supabase secrets set ...):
//   SB_URL                = your project URL
//   SB_SERVICE_ROLE_KEY   = service_role key (Project Settings → API)  [keep secret]
//   RESEND_API_KEY        = a free Resend API key (https://resend.com)  [for email]
//   RESEND_FROM           = e.g. "Family Portal <reminders@yourdomain.com>"
//   VAPID_PUBLIC_KEY      = web-push public key   (same one you paste into index.html)
//   VAPID_PRIVATE_KEY     = web-push private key  [keep secret]
//   VAPID_SUBJECT         = "mailto:you@example.com"

import { createClient } from "npm:@supabase/supabase-js@2";
import { HDate } from "npm:@hebcal/core@5.4.6";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const supa = createClient(env("SB_URL"), env("SB_SERVICE_ROLE_KEY"));

if (env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")) {
  webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
}

// ---- date math (mirrors the frontend) ----
function gregToDate(str: string) { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function occurrencesInRange(ev: any, start: Date, end: Date) {
  const out: any[] = []; const orig = gregToDate(ev.greg_date);
  if (ev.frequency === "once") { if (orig >= start && orig <= end) out.push({ date: orig, years: 0 }); return out; }
  if (ev.recurrence === "gregorian") {
    for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) {
      const d = new Date(yr, orig.getMonth(), orig.getDate(), 12);
      if (d.getMonth() !== orig.getMonth()) continue;
      if (d >= start && d <= end) out.push({ date: d, years: yr - orig.getFullYear() });
    }
    return out;
  }
  const oh = new HDate(orig); const oy = oh.getFullYear(), om = oh.getMonth(), od = oh.getDate();
  const hyS = new HDate(start).getFullYear(), hyE = new HDate(end).getFullYear();
  for (let hy = hyS - 1; hy <= hyE + 1; hy++) {
    let m = om;
    if (om === 12 && HDate.isLeapYear(hy) && !HDate.isLeapYear(oy)) m = 13;
    if (om === 13 && !HDate.isLeapYear(hy)) m = 12;
    let dim; try { dim = HDate.daysInMonth(m, hy); } catch { continue; }
    const d = Math.min(od, dim);
    let occ; try { occ = new HDate(d, m, hy); } catch { continue; }
    const g = occ.greg(); g.setHours(12, 0, 0, 0);
    if (g >= start && g <= end) out.push({ date: g, years: hy - oy });
  }
  return out;
}
const TYPE: Record<string, string> = { yahrzeit: "Yahrzeit", birthday: "Birthday", anniversary: "Anniversary", milestone: "Milestone" };
const dkey = (d: Date) => d.toISOString().slice(0, 10);

async function alreadySent(event_id: string, occ: string, channel: string, target: string) {
  const { data } = await supa.from("reminder_log").select("id").eq("event_id", event_id).eq("occ_date", occ).eq("channel", channel).eq("target", target).maybeSingle();
  return !!data;
}
async function logSent(event_id: string, occ: string, channel: string, target: string) {
  await supa.from("reminder_log").insert({ event_id, occ_date: occ, channel, target });
}

async function sendEmail(to: string, subject: string, text: string) {
  if (!env("RESEND_API_KEY")) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("RESEND_FROM") || "Family Portal <onboarding@resend.dev>", to: [to], subject, text }),
  });
  return r.ok;
}

Deno.serve(async () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + 60);

  // pull data
  const [{ data: events }, { data: households }, { data: profiles }, { data: subs }] = await Promise.all([
    supa.from("events").select("*").not("remind", "is", null),
    supa.from("households").select("id,name"),
    supa.from("profiles").select("id,household_id,is_admin, users:auth_users(email)"),
    supa.from("push_subscriptions").select("*"),
  ]);
  const hhName: Record<string, string> = Object.fromEntries((households || []).map((h: any) => [h.id, h.name]));

  let emailCount = 0, pushCount = 0;
  for (const ev of events || []) {
    const r = ev.remind; if (!r || !r.on) continue;
    for (const o of occurrencesInRange(ev, today, end)) {
      const daysUntil = Math.round((new Date(o.date).setHours(0, 0, 0, 0) - +today) / 86400000);
      if (daysUntil > (r.daysBefore ?? 7)) continue;
      const occ = dkey(o.date);
      const label = (o.years > 0 && ev.recur_title) ? ev.recur_title : ev.title;
      const when = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;
      const subject = `${TYPE[ev.type]}: ${label}`;
      const body = `${hhName[ev.household_id] || ""} family — ${when} (${o.date.toDateString()}).` + (ev.notes ? `\n${ev.notes}` : "");

      // EMAIL
      if (r.channels?.email) {
        const targets: string[] = r.notify === "custom"
          ? String(r.emails || "").split(",").map((s) => s.trim()).filter(Boolean)
          : (profiles || []).filter((p: any) => p.household_id === ev.household_id && p.users?.email).map((p: any) => p.users.email);
        for (const to of targets) {
          if (await alreadySent(ev.id, occ, "email", to)) continue;
          if (await sendEmail(to, subject, body)) { await logSent(ev.id, occ, "email", to); emailCount++; }
        }
      }
      // WEB PUSH (to family logins, or admins)
      if (r.channels?.push && env("VAPID_PRIVATE_KEY")) {
        const userIds = new Set((profiles || []).filter((p: any) => p.household_id === ev.household_id || p.is_admin).map((p: any) => p.id));
        for (const s of (subs || []).filter((x: any) => userIds.has(x.user_id))) {
          if (await alreadySent(ev.id, occ, "push", s.endpoint)) continue;
          try {
            await webpush.sendNotification(s.sub, JSON.stringify({ title: subject, body, tag: `${ev.id}-${occ}`, url: "/" }));
            await logSent(ev.id, occ, "push", s.endpoint); pushCount++;
          } catch (_e) { /* expired subscription — could delete here */ }
        }
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, emailCount, pushCount }), { headers: { "Content-Type": "application/json" } });
});
