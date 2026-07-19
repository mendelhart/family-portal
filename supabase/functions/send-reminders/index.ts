// Supabase Edge Function: send-reminders
// Runs once a day. Two jobs:
//   1) CELEBRATION email (+ push) on the DAY of each event -> to that immediate family.
//   2) WEEKLY DIGEST (default Sundays) -> to EVERYONE: the week's events.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Schedule (daily) with pg_cron -> see SETUP.md.
//
// Function secrets (supabase secrets set ...):
//   SB_URL, SB_SERVICE_ROLE_KEY, RESEND_API_KEY, RESEND_FROM
//   (optional push) VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   (optional) DIGEST_DOW = 0..6  (0 = Sunday, default)

import { createClient } from "npm:@supabase/supabase-js@2";
import { HDate } from "npm:@hebcal/core@5.4.6";
import webpush from "npm:web-push@3.6.7";

const env = (k: string) => Deno.env.get(k) ?? "";
const supa = createClient(env("SB_URL"), env("SB_SERVICE_ROLE_KEY"));
const hasPush = !!(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"));
if (hasPush) webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

function gregToDate(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function hebrewDateInYear(oh: any, hy: number) {
  const om = oh.getMonth(), od = oh.getDate(), oy = oh.getFullYear(); let m = om;
  if (om === 12 && HDate.isLeapYear(hy) && !HDate.isLeapYear(oy)) m = 13;
  if (om === 13 && !HDate.isLeapYear(hy)) m = 12;
  let dim; try { dim = HDate.daysInMonth(m, hy); } catch { return null; }
  try { return new HDate(Math.min(od, dim), m, hy); } catch { return null; }
}
// occurrences of one event within [start,end] (Hebrew or Gregorian recurrence, once or yearly)
function occurrences(ev: any, start: Date, end: Date) {
  const out: any[] = []; const orig = gregToDate(ev.greg_date);
  if (ev.frequency === "once") { if (orig >= start && orig <= end) out.push({ date: orig, years: 0 }); return out; }
  if (ev.recurrence === "gregorian") {
    for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++) { const d = new Date(yr, orig.getMonth(), orig.getDate(), 12);
      if (d.getMonth() === orig.getMonth() && d >= start && d <= end) out.push({ date: d, years: yr - orig.getFullYear() }); }
    return out;
  }
  const oh = new HDate(orig); const hyS = new HDate(start).getFullYear(), hyE = new HDate(end).getFullYear();
  for (let hy = hyS - 1; hy <= hyE + 1; hy++) { const occ = hebrewDateInYear(oh, hy); if (!occ) continue;
    const g = occ.greg(); g.setHours(12, 0, 0, 0); if (g >= start && g <= end) out.push({ date: g, years: hy - oh.getFullYear() }); }
  return out;
}
// derived events (member birthdays + Bar/Bas Mitzvah), mirroring the app
function derivedForMember(m: any) {
  const evs: any[] = [];
  if (m.birthday) {
    evs.push({ household_id: m.household_id, type: "birthday", title: `${m.first_name} ${m.last_name || ""}`.trim(), greg_date: m.birthday, recurrence: "hebrew", frequency: "yearly" });
    if (m.gender === "m" || m.gender === "f") { const age = m.gender === "m" ? 13 : 12;
      const oh = new HDate(gregToDate(m.birthday)); const occ = hebrewDateInYear(oh, oh.getFullYear() + age);
      if (occ) { const g = occ.greg(); const gd = `${g.getFullYear()}-${String(g.getMonth()+1).padStart(2,"0")}-${String(g.getDate()).padStart(2,"0")}`;
        evs.push({ household_id: m.household_id, type: "milestone", title: `${m.first_name} — ${m.gender === "m" ? "Bar Mitzvah" : "Bas Mitzvah"}`, greg_date: gd, recurrence: "gregorian", frequency: "once" }); } }
  }
  return evs;
}
const TYPE: Record<string,string> = { yahrzeit:"Yahrzeit", birthday:"Birthday", anniversary:"Anniversary", milestone:"Milestone" };
const dkey = (d: Date) => d.toISOString().slice(0,10);

async function sent(event_id: string, occ: string, channel: string, target: string) {
  const { data } = await supa.from("reminder_log").select("id").eq("event_id", event_id).eq("occ_date", occ).eq("channel", channel).eq("target", target).maybeSingle();
  return !!data;
}
async function logSent(event_id: string, occ: string, channel: string, target: string) {
  await supa.from("reminder_log").insert({ event_id, occ_date: occ, channel, target }); }
async function email(to: string, subject: string, html: string) {
  if (!env("RESEND_API_KEY")) return false;
  const r = await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("RESEND_FROM") || "Family Portal <onboarding@resend.dev>", to: [to], subject, html }) });
  return r.ok;
}

Deno.serve(async () => {
  const today = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 6);
  const digestDow = Number(env("DIGEST_DOW") || "0");

  const [{ data: households }, { data: members }, { data: rawEvents }, { data: profiles }, { data: subs }, { data: settings }] = await Promise.all([
    supa.from("households").select("id,name,email"),
    supa.from("members").select("*"),
    supa.from("events").select("*"),
    supa.from("profiles").select("id,household_id, users:auth_users(email)"),
    supa.from("push_subscriptions").select("*"),
    supa.from("settings").select("*"),
  ]);
  const hhName: Record<string,string> = Object.fromEntries((households||[]).map((h:any)=>[h.id,h.name]));

  // admin-editable email templates (fallback to defaults)
  const DEFAULT_T: any = {
    birthday:{ subject:"🎂 Happy Birthday, {name}!", body:"Wishing {name} a very happy birthday! Mazel tov from the whole family.\n\n{family} family · {date} · {hebrew}" },
    anniversary:{ subject:"💐 Happy Anniversary — {name}", body:"Wishing a very happy anniversary! Mazel tov.\n\n{family} family · {date} · {hebrew}" },
    milestone:{ subject:"🎉 Mazel Tov — {name}", body:"Mazel tov on this simcha!\n\n{family} family · {date} · {hebrew}" },
    yahrzeit:{ subject:"🕯️ Yahrzeit today — {name}", body:"Today is the yahrzeit of {name}. May the neshama have an aliyah.\n\n{family} family · {date} · {hebrew}" },
    digest:{ subject:"This week's family events", heading:"This week in the family" } };
  let T = DEFAULT_T;
  const etRow = (settings||[]).find((s:any)=>s.key==="emailTemplates");
  if (etRow?.value) { try { const parsed = JSON.parse(etRow.value); T = {}; for (const k in DEFAULT_T) T[k] = { ...DEFAULT_T[k], ...(parsed[k]||{}) }; } catch { T = DEFAULT_T; } }
  const fill = (s:string, v:Record<string,string>) => String(s||"").replace(/\{(name|family|date|hebrew)\}/g, (_,k)=>v[k]??"");

  // all events = explicit + derived
  const events: any[] = [ ...(rawEvents||[]) ];
  (members||[]).forEach((m:any)=> derivedForMember(m).forEach(e=>events.push({ ...e, id: `${m.id}_${e.type}` })));

  // recipients per household (immediate family): member emails + household email + linked profile emails
  const familyEmails = (hid: string) => {
    const set = new Set<string>();
    (members||[]).filter((m:any)=>m.household_id===hid && m.email).forEach((m:any)=>set.add(m.email));
    const hh = (households||[]).find((h:any)=>h.id===hid); if (hh?.email) set.add(hh.email);
    (profiles||[]).filter((p:any)=>p.household_id===hid && p.users?.email).forEach((p:any)=>set.add(p.users.email));
    return [...set];
  };
  const everyoneEmails = () => {
    const set = new Set<string>();
    (members||[]).forEach((m:any)=>m.email && set.add(m.email));
    (households||[]).forEach((h:any)=>h.email && set.add(h.email));
    (profiles||[]).forEach((p:any)=>p.users?.email && set.add(p.users.email));
    return [...set];
  };

  let celebrations = 0, digestEmails = 0, pushes = 0;

  // ---- 1) DAY-OF CELEBRATIONS ----
  for (const ev of events) {
    for (const o of occurrences(ev, today, today)) {
      const occ = dkey(o.date);
      const label = (o.years > 0 && ev.recur_title) ? ev.recur_title : ev.title;
      const tpl = T[ev.type] || DEFAULT_T.milestone;
      const vars = { name: label, family: hhName[ev.household_id] || "", date: o.date.toDateString(), hebrew: new HDate(o.date).render("en") };
      const subject = fill(tpl.subject, vars);
      const html = `<div style="font-family:Georgia,serif"><h2 style="color:#2f3a73">${fill(tpl.subject, vars)}</h2>
        <p style="white-space:pre-line">${fill(tpl.body, vars)}</p></div>`;
      for (const to of familyEmails(ev.household_id)) {
        if (await sent(ev.id, occ, "celebration", to)) continue;
        if (await email(to, subject, html)) { await logSent(ev.id, occ, "celebration", to); celebrations++; }
      }
      if (hasPush) { const uids = new Set((profiles||[]).filter((p:any)=>p.household_id===ev.household_id).map((p:any)=>p.id));
        for (const s of (subs||[]).filter((x:any)=>uids.has(x.user_id))) {
          if (await sent(ev.id, occ, "push", s.endpoint)) continue;
          try { await webpush.sendNotification(s.sub, JSON.stringify({ title: subject, body: `${hhName[ev.household_id]||""} family`, url: "/" })); await logSent(ev.id, occ, "push", s.endpoint); pushes++; } catch {}
        } }
    }
  }

  // ---- 2) WEEKLY DIGEST (to everyone) ----
  if (today.getDay() === digestDow) {
    const items: {d:Date,label:string,type:string,fam:string}[] = [];
    for (const ev of events) for (const o of occurrences(ev, today, weekEnd)) {
      const label = (o.years > 0 && ev.recur_title) ? ev.recur_title : ev.title;
      items.push({ d: o.date, label, type: ev.type, fam: hhName[ev.household_id] || "" });
    }
    items.sort((a,b)=>+a.d - +b.d);
    if (items.length) {
      const wk = dkey(today);
      const rowsHtml = items.map(i=>`<tr><td style="padding:4px 10px">${i.d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</td>
        <td style="padding:4px 10px">${new HDate(i.d).render("en")}</td>
        <td style="padding:4px 10px"><b>${TYPE[i.type]}:</b> ${i.label} <span style="color:#888">(${i.fam})</span></td></tr>`).join("");
      const html = `<div style="font-family:Georgia,serif"><h2 style="color:#2f3a73">${T.digest.heading || "This week in the family"}</h2>
        <table style="border-collapse:collapse">${rowsHtml}</table></div>`;
      for (const to of everyoneEmails()) {
        if (await sent("digest", wk, "digest", to)) continue;
        if (await email(to, T.digest.subject || "This week's family events", html)) { await logSent("digest", wk, "digest", to); digestEmails++; }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, celebrations, digestEmails, pushes }), { headers: { "Content-Type": "application/json" } });
});
