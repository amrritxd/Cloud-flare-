// Amrit Tution Telegram bot v3 - 24 ghante jawab (Cloudflare Worker, free)
// Settings > Variables mein sirf BOT_TOKEN daalna hai. Baaki sab yahin set hai.
const DB = "https://amritt-editon-default-rtdb.firebaseio.com";
const DEFAULT_CHAT = "8918487470";
const CLASSES = Array.from({ length: 12 }, (_, i) => String(i + 1));
const SUBS = ["Maths", "Science", "English", "Hindi"];
const KB = { keyboard: [
  ["\u{1F441} Visitors", "\u{1F4CA} Summary"],
  ["\u{1F7E2} Live abhi", "\u{1F3C6} Toppers"],
  ["\u{1F195} Recent", "\u{1F6A9} Flagged"],
  ["\u{1F4DA} Subjects", "\u{1F648} Absent"],
  ["\u{1F4C5} Weekly", "\u2753 Menu"],
  ["\u{1F4F8} Photos"]
], resize_keyboard: true, is_persistent: true };
const LIVE_FRESH = 75e3, HOLD_MS = 2 * 864e5, FULL_Q = 30;

// ---------- chhote helpers ----------
const nk = n => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
const tgE = v => String(v == null ? "" : v).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const tgNow = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const tgAt = ms => ms ? new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "-";
const istDay = (ms = Date.now()) => new Date(ms + 19800000).toISOString().slice(0, 10);
const dayStart = (back = 0) => Math.floor((Date.now() + 19800000) / 864e5) * 864e5 - 19800000 - back * 864e5;
const dm = ms => { const d = istDay(ms); return d.slice(8) + "/" + d.slice(5, 7); };
const fmtT = ms => { if (!ms) return ""; const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const clsLabelEn = c => /^\d+$/.test(c) ? "Class " + c : c;
const holdLeft = r => Math.max(0, (r && r.createdAt ? r.createdAt : Date.now()) + HOLD_MS - Date.now());
const hrs = ms => { const h = Math.ceil(ms / 36e5); return h >= 24 ? Math.floor(h / 24) + " din " + (h % 24) + " ghante" : h + " ghante"; };
const pct = r => Math.round(r.score / r.total * 100);
const avg = a => a.length ? Math.round(a.reduce((s, r) => s + r.score / r.total * 100, 0) / a.length) : 0;
const sk = r => nk(r.name) + "|" + r.cls;
const uniqN = a => new Set(a.map(sk)).size;
const clsKey = c => /^\d+$/.test(c) ? Number(c) : 99;
const inRange = (r, a, b) => (r.createdAt || 0) >= a && (r.createdAt || 0) < b;
const lab = (name, cls) => tgE(name) + " (" + tgE(clsLabelEn(cls)) + ")";
const cmpR = (a, b) => (b.score / b.total - a.score / a.total) || ((a.timeMs || 1e12) - (b.timeMs || 1e12)) || ((a.createdAt || 0) - (b.createdAt || 0));
const rline = r => "\u2022 <b>" + tgE(r.name) + "</b> \u00B7 " + tgE(clsLabelEn(r.cls)) + " \u00B7 " + tgE(r.subject || "-") + " \u00B7 " + r.score + "/" + r.total + " (" + pct(r) + "%)" + (r.timeMs ? " \u00B7 " + fmtT(r.timeMs) : "") + ((r.leaves || 0) >= 1 ? " \u{1F6A9}" + r.leaves : "");

// lambi list ko Telegram ki limit ke andar rakhta hai
function cap(head, lines, tail) {
  let out = head, n = 0;
  for (const l of lines) { if ((out + "\n" + l).length > 3500) break; out += "\n" + l; n++; }
  if (n < lines.length) out += "\n\u2026 aur " + (lines.length - n) + " hain";
  return out + (tail ? "\n" + tail : "");
}
function bestPerStudent(rs) {
  const m = {};
  rs.forEach(r => { const k = sk(r); if (!m[k] || cmpR(r, m[k]) < 0) m[k] = r; });
  return Object.values(m).sort(cmpR);
}

// ---------- Firebase ----------
async function fb(path, qs) {
  const r = await fetch(DB + "/" + path + ".json" + (qs || ""));
  if (!r.ok) throw new Error("firebase " + r.status);
  return r.json();
}
async function loadResults() {
  const v = (await fb("testResults", '?orderBy=%22%24key%22&limitToLast=1000')) || {};
  return Object.entries(v).filter(([, x]) => x && typeof x === "object" && Number(x.total) > 0 && !/^(lkg|ukg)$/i.test(String(x.cls || "").trim()))
    .map(([id, x]) => ({ id, ...x, score: Number(x.score) || 0, total: Number(x.total), name: String(x.name || "").trim() || "Student", cls: String(x.cls || "") }));
}

// ---------- topper logic (4 subject 30/30) ----------
const betterR = (a, b) => !b || (a.score / a.total > b.score / b.total) || (a.score / a.total === b.score / b.total && (a.timeMs || 1e12) < (b.timeMs || 1e12));
// har student ka: kaun-kaun se subject mein 30/30 aaya (best result)
function fullMap(results) {
  const m = {};
  results.forEach(r => {
    if (!SUBS.includes(r.subject) || !(Number(r.total) >= FULL_Q) || Number(r.score) !== Number(r.total)) return;
    const k = sk(r), e = m[k] || (m[k] = { name: r.name, cls: r.cls, subs: {} });
    if (betterR(r, e.subs[r.subject])) e.subs[r.subject] = r;
  });
  return Object.values(m);
}
function classToppers(results) {
  const best = {};
  fullMap(results).forEach(e => {
    if (!SUBS.every(x => e.subs[x])) return;
    const timeMs = SUBS.reduce((s, x) => s + (e.subs[x].timeMs || 0), 0), done = Math.max(...SUBS.map(x => e.subs[x].createdAt || 0));
    const b = best[e.cls];
    if (!b || timeMs < b.timeMs || (timeMs === b.timeMs && done < b.done)) best[e.cls] = { name: e.name, timeMs, done };
  });
  return CLASSES.filter(c => best[c]).map(c => ({ c, r: { name: best[c].name, cls: c, timeMs: best[c].timeMs, createdAt: best[c].done } }));
}

// ---------- purane commands ----------
async function visitText() {
  const v = (await fb("testBotMeta/visits")) || {}, D = v.d || {}, n = x => Number(x) || 0;
  const t = istDay(), y = istDay(Date.now() - 864e5); let w = 0, wo = 0;
  for (let i = 0; i < 7; i++) { const d = D[istDay(Date.now() - i * 864e5)] || {}; w += n(d.u); wo += n(d.o); }
  const T = D[t] || {}, Y = D[y] || {};
  return "\u{1F441} <b>Website visitors</b>\n\u{1F4C5} Aaj: <b>" + n(T.u) + "</b> log (" + n(T.o) + " baar khola)\n\u{1F553} Kal: <b>" + n(Y.u) + "</b> log (" + n(Y.o) + " baar)\n\u{1F5D3} Pichhle 7 din: <b>" + w + "</b> log-din (" + wo + " baar)\n\u{1F465} Ab tak total: <b>" + n(v.u) + "</b> alag log \u00B7 " + n(v.o) + " baar open\n\u{1F552} " + tgNow();
}
async function visitWeek() {
  try {
    const v = (await fb("testBotMeta/visits")) || {}, D = v.d || {}, n = x => Number(x) || 0; let w = 0, wo = 0;
    for (let i = 0; i < 7; i++) { const d = D[istDay(Date.now() - i * 864e5)] || {}; w += n(d.u); wo += n(d.o); }
    return "\u{1F441} Visitors (7 din): <b>" + w + "</b> log-din (" + wo + " baar khola)";
  } catch (e) { return ""; }
}
async function summaryText(back = 0) {
  const results = await loadResults();
  let stuN = 0; if (!back) { try { stuN = Object.keys((await fb("testStudents", "?shallow=true")) || {}).length; } catch (e) {} }
  const a = dayStart(back), b = back ? dayStart(back - 1) : Infinity, T = results.filter(r => inRange(r, a, b)), tops = classToppers(results);
  let out = "\u{1F4CA} <b>" + (back ? "Kal ka summary" : "Aaj ka summary") + "</b>\n\u{1F4DD} Tests: <b>" + T.length + "</b>\n\u{1F465} Students: <b>" + uniqN(T) + "</b>\n\u{1F4C8} Average: <b>" + avg(T) + "%</b>\n\u{1F6A9} Flagged (3+ leaves): <b>" + T.filter(r => (r.leaves || 0) >= 3).length + "</b>\n\u{1F4DA} Total tests: <b>" + results.length + "</b>" + (stuN ? " \u00B7 Total students: <b>" + stuN + "</b>" : "") + "\n\u{1F3C6} Class toppers (4 subject 30/30): <b>" + (tops.length ? tops.map(o => lab(o.r.name, o.c) + (holdLeft(o.r) === 0 ? " \u{1F381}" : "")).join(", ") : "abhi koi nahi") + "</b>\n\u{1F381} = 2 din se topper (inaam ka time)";
  if (!back) { try { out += "\n\n" + await visitText(); } catch (e) {} }
  return out;
}
async function liveText() {
  const v = (await fb("testLive")) || {};
  const L = Object.values(v).filter(x => x && x.name && x.subject !== "Online" && Date.now() - (x.ts || x.startedAt || 0) < LIVE_FRESH);
  return "\u{1F7E2} <b>Live abhi: " + L.length + "</b>" + (L.length ? "\n" + L.slice(0, 40).map(x => "\u2022 " + tgE(x.name) + " \u00B7 " + tgE(clsLabelEn(String(x.cls || ""))) + " \u00B7 " + tgE(x.subject || "")).join("\n") : "");
}
async function toppersText() {
  const tops = classToppers(await loadResults());
  return "\u{1F3C6} <b>Class toppers</b> (4 subject 30/30)\n" + (tops.length ? tops.map(o => "\u2022 " + lab(o.r.name, o.c)).join("\n") : "Abhi koi nahi");
}

// ---------- NAYE commands ----------
// 1. Aakhri tests
async function recentText(n) {
  const L = (await loadResults()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, n);
  if (!L.length) return "\u{1F195} Abhi koi test nahi hua.";
  return cap("\u{1F195} <b>Aakhri " + L.length + " tests</b>", L.map(r => rline(r) + " \u00B7 " + tgAt(r.createdAt)));
}

// 2. Class report
async function classText(c) {
  const all = await loadResults(), R = all.filter(r => String(r.cls) === String(c));
  const head = "\u{1F3EB} <b>" + tgE(clsLabelEn(c)) + " report</b>";
  if (!R.length) return head + "\nAbhi koi test nahi.";
  const tday = R.filter(r => (r.createdAt || 0) >= dayStart(0)), top = classToppers(R).find(o => o.c === String(c));
  const subs = {}; R.forEach(r => (subs[r.subject || "-"] = subs[r.subject || "-"] || []).push(r));
  const subLine = Object.keys(subs).sort().map(s => tgE(s) + " " + avg(subs[s]) + "%").join(" \u00B7 ");
  const best = bestPerStudent(R).slice(0, 5).map((r, i) => (i + 1) + ". " + tgE(r.name) + " \u2014 " + tgE(r.subject || "-") + " " + r.score + "/" + r.total + (r.timeMs ? " (" + fmtT(r.timeMs) + ")" : ""));
  return cap(head + "\n\u{1F465} Students: <b>" + uniqN(R) + "</b> \u00B7 Tests: <b>" + R.length + "</b>\n\u{1F4C8} Average: <b>" + avg(R) + "%</b>\n\u{1F4C5} Aaj: <b>" + tday.length + "</b> tests (" + uniqN(tday) + " students)\n\u{1F4DA} " + subLine + "\n\u{1F3C6} Topper: <b>" + (top ? tgE(top.r.name) + " (" + fmtT(top.r.timeMs) + ")" : "abhi koi nahi") + "</b>\n\n<b>Best 5</b>", best);
}

// 3. Student search (kisi ka bhi naam likho)
async function studentText(q) {
  const qn = nk(q), results = await loadResults(), g = {};
  results.forEach(r => { if (nk(r.name).includes(qn)) (g[sk(r)] = g[sk(r)] || []).push(r); });
  const keys = Object.keys(g);
  if (!keys.length) return "\u{1F50D} \"" + tgE(q) + "\" naam ka koi student nahi mila.\n\u2753 Menu dabao to saare commands dikhenge.";
  if (keys.length > 6) {
    const L = keys.map(k => "\u2022 " + lab(g[k][0].name, g[k][0].cls));
    return cap("\u{1F50D} <b>" + keys.length + " students mile</b> \u2014 poora naam likho:", L);
  }
  const fm = fullMap(results), blocks = keys.map(k => {
    const rs = g[k].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), r0 = rs[0];
    const e = fm.find(x => sk(x) === k), done = e ? SUBS.filter(s => e.subs[s]).length : 0;
    const by = {}; rs.forEach(r => { const s = r.subject || "-"; if (!by[s] || cmpR(r, by[s]) < 0) by[s] = r; });
    const subL = Object.keys(by).sort().map(s => "   " + tgE(s) + ": " + by[s].score + "/" + by[s].total + (by[s].timeMs ? " (" + fmtT(by[s].timeMs) + ")" : "")).join("\n");
    const leaves = rs.reduce((s, r) => s + (r.leaves || 0), 0);
    return "\u{1F464} <b>" + tgE(r0.name) + "</b> \u00B7 " + tgE(clsLabelEn(r0.cls)) + "\n\u{1F4DD} Tests: " + rs.length + " \u00B7 Average: " + avg(rs) + "%\n\u{1F3C6} 30/30 subject: " + done + "/4" + (leaves ? " \u00B7 \u{1F6A9} leaves: " + leaves : "") + "\n" + subL + "\n\u{1F553} Aakhri test: " + tgAt(r0.createdAt);
  });
  return cap("\u{1F50D} <b>Student report</b>", blocks.join("\n\n").split("\n"));
}

// 4. Flagged (3+ leaves, pichhle 7 din)
async function flaggedText() {
  const from = dayStart(6), L = (await loadResults()).filter(r => (r.leaves || 0) >= 3 && (r.createdAt || 0) >= from).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!L.length) return "\u{1F6A9} Pichhle 7 din mein koi flagged test nahi. \u2705";
  return cap("\u{1F6A9} <b>Flagged tests (3+ leaves, 7 din): " + L.length + "</b>", L.map(r => "\u2022 <b>" + tgE(r.name) + "</b> \u00B7 " + tgE(clsLabelEn(r.cls)) + " \u00B7 " + tgE(r.subject || "-") + " \u00B7 " + r.score + "/" + r.total + " \u00B7 leaves " + r.leaves + " \u00B7 " + dm(r.createdAt || 0)));
}

// 5. Subject average + class-wise kamzor subject
async function subjectsText() {
  const R = await loadResults(), by = {};
  R.forEach(r => { const s = r.subject || "-"; (by[s] = by[s] || []).push(r); });
  const names = Object.keys(by).filter(s => s !== "Online");
  if (!names.length) return "\u{1F4DA} Abhi koi data nahi.";
  names.sort((a, b) => avg(by[a]) - avg(by[b]));
  const L = names.map((s, i) => "\u2022 " + tgE(s) + ": <b>" + avg(by[s]) + "%</b> \u00B7 " + by[s].length + " tests" + (avg(by[s]) && by[s].some(r => r.timeMs) ? " \u00B7 " + fmtT(by[s].reduce((t, r) => t + (r.timeMs || 0), 0) / by[s].filter(r => r.timeMs).length || 0) + " avg time" : "") + (i === 0 && names.length > 1 ? " \u{1F53B} sabse kamzor" : "") + (i === names.length - 1 && names.length > 1 ? " \u{1F51D} sabse best" : ""));
  const cw = {}; R.forEach(r => { const c = r.cls, s = r.subject || "-"; if (s === "Online") return; ((cw[c] = cw[c] || {})[s] = cw[c][s] || []).push(r); });
  const W = Object.keys(cw).sort((a, b) => clsKey(a) - clsKey(b)).map(c => {
    const arr = Object.keys(cw[c]).filter(s => cw[c][s].length >= 3).map(s => ({ s, a: avg(cw[c][s]) })).sort((x, y) => x.a - y.a);
    return arr.length ? "\u2022 " + tgE(clsLabelEn(c)) + ": " + tgE(arr[0].s) + " (" + arr[0].a + "%)" : "";
  }).filter(Boolean);
  return cap("\u{1F4DA} <b>Subject-wise average</b>\n" + L.join("\n") + (W.length ? "\n\n\u{1F53B} <b>Class-wise kamzor subject</b>" : ""), W);
}

// 6. Absent (pichhle 7 din mein aaye, aaj nahi) / Inactive (7 din se nahi aaye)
async function absentText(mode) {
  const R = await loadResults(), last = {};
  R.forEach(r => { const k = sk(r), t = r.createdAt || 0; if (!last[k] || t > last[k].t) last[k] = { name: r.name, cls: r.cls, t }; });
  const s0 = dayStart(0), s7 = dayStart(7);
  const L = Object.values(last).filter(x => mode === "absent" ? (x.t >= s7 && x.t < s0) : x.t < s7);
  const title = mode === "absent" ? "\u{1F648} <b>Aaj nahi aaye</b> (pichhle 7 din mein aaye the): " : "\u{1F47B} <b>7 din se gayab</b>: ";
  if (!L.length) return title + "0\nSab theek hai! \u2705";
  const g = {}; L.forEach(x => (g[x.cls] = g[x.cls] || []).push(x));
  const lines = Object.keys(g).sort((a, b) => clsKey(a) - clsKey(b)).map(c => "<b>" + tgE(clsLabelEn(c)) + "</b>: " + g[c].sort((a, b) => b.t - a.t).map(x => tgE(x.name) + (mode === "inactive" && x.t ? " (" + dm(x.t) + ")" : "")).join(", "));
  return cap(title + "<b>" + L.length + "</b>", lines, "\u2139\uFE0F Sirf wahi students jo kabhi test de chuke hain.");
}

// 7. Weekly report
async function weeklyText() {
  const R = await loadResults(), W = R.filter(r => (r.createdAt || 0) >= dayStart(6));
  const days = []; for (let i = 6; i >= 0; i--) { const D = W.filter(r => inRange(r, dayStart(i), i ? dayStart(i - 1) : Infinity)); days.push("\u2022 " + dm(dayStart(i)) + ": " + D.length + " tests \u00B7 " + uniqN(D) + " students" + (D.length ? " \u00B7 " + avg(D) + "%" : "")); }
  const sub = SUBS.map(s => { const a = W.filter(r => r.subject === s); return a.length ? tgE(s) + " " + avg(a) + "%" : ""; }).filter(Boolean).join(" \u00B7 ");
  const top3 = bestPerStudent(W).slice(0, 3).map((r, i) => (i + 1) + ". " + tgE(r.name) + " (" + tgE(clsLabelEn(r.cls)) + ") \u2014 " + tgE(r.subject || "-") + " " + r.score + "/" + r.total);
  const tops = classToppers(R), vis = await visitWeek();
  return cap("\u{1F4C5} <b>Weekly report (7 din)</b>\n\u{1F4DD} Tests: <b>" + W.length + "</b> \u00B7 Students: <b>" + uniqN(W) + "</b>\n\u{1F4C8} Average: <b>" + avg(W) + "%</b>\n\u{1F6A9} Flagged: <b>" + W.filter(r => (r.leaves || 0) >= 3).length + "</b>\n" + (sub ? "\u{1F4DA} " + sub + "\n" : "") + (vis ? vis + "\n" : "") + "\n<b>Din-wise</b>", days.concat(["", "<b>Top 3 (hafta)</b>"], top3.length ? top3 : ["abhi koi nahi"], ["", "\u{1F3C6} Class toppers: " + (tops.length ? tops.map(o => lab(o.r.name, o.c)).join(", ") : "abhi koi nahi")]));
}

// 8. Top 10 (aaj ya hamesha)
async function topText(today, n) {
  let R = await loadResults(); if (today) R = R.filter(r => (r.createdAt || 0) >= dayStart(0));
  const L = bestPerStudent(R).slice(0, n);
  if (!L.length) return "\u{1F3C5} Abhi koi result nahi.";
  return cap("\u{1F3C5} <b>Top " + L.length + (today ? " (aaj)" : " (ab tak)") + "</b>", L.map((r, i) => (i + 1) + ". <b>" + tgE(r.name) + "</b> (" + tgE(clsLabelEn(r.cls)) + ") \u2014 " + tgE(r.subject || "-") + " " + r.score + "/" + r.total + (r.timeMs ? " \u00B7 " + fmtT(r.timeMs) : "")));
}

// 9. Inaam (toppers ka 2 din ka hisaab)
async function inaamText() {
  const tops = classToppers(await loadResults());
  if (!tops.length) return "\u{1F381} Abhi koi class topper nahi.";
  const due = tops.filter(o => holdLeft(o.r) === 0), wait = tops.filter(o => holdLeft(o.r) > 0);
  return cap("\u{1F381} <b>Inaam list</b> (topper 2 din tak toppers par rahe to)", due.map(o => "\u{1F381} <b>" + lab(o.r.name, o.c) + "</b> \u2014 inaam do").concat(wait.map(o => "\u23F3 " + lab(o.r.name, o.c) + " \u2014 " + hrs(holdLeft(o.r)) + " baaki")));
}

// 10. Topper ke kareeb (2-3 subject 30/30 ho chuke)
async function kareebText() {
  const L = fullMap(await loadResults()).map(e => ({ e, n: SUBS.filter(s => e.subs[s]).length })).filter(x => x.n >= 2 && x.n < 4)
    .sort((a, b) => b.n - a.n || clsKey(a.e.cls) - clsKey(b.e.cls));
  if (!L.length) return "\u{1F3AF} Abhi koi topper ke kareeb nahi.";
  return cap("\u{1F3AF} <b>Topper ke kareeb</b> (kuch subject 30/30 baaki)", L.map(x => "\u2022 " + lab(x.e.name, x.e.cls) + " \u2014 " + x.n + "/4 \u00B7 baaki: " + SUBS.filter(s => !x.e.subs[s]).map(tgE).join(", ")));
}

// 11. Sabse tez 30/30
async function fastestText() {
  const R = (await loadResults()).filter(r => SUBS.includes(r.subject) && r.total >= FULL_Q && r.score === r.total && r.timeMs > 0);
  if (!R.length) return "\u26A1 Abhi koi 30/30 nahi.";
  const out = SUBS.map(s => {
    const a = R.filter(r => r.subject === s).sort((x, y) => x.timeMs - y.timeMs), seen = {}, L = [];
    for (const r of a) { if (seen[sk(r)]) continue; seen[sk(r)] = 1; L.push(r); if (L.length === 3) break; }
    return L.length ? "<b>" + tgE(s) + "</b>\n" + L.map((r, i) => "  " + (i + 1) + ". " + lab(r.name, r.cls) + " \u2014 " + fmtT(r.timeMs)).join("\n") : "";
  }).filter(Boolean);
  return cap("\u26A1 <b>Sabse tez 30/30</b>", out.join("\n\n").split("\n"));
}

// 12. Saari classes ek nazar mein
async function classesText() {
  const R = await loadResults(), g = {};
  R.forEach(r => (g[r.cls] = g[r.cls] || []).push(r));
  const ks = Object.keys(g).sort((a, b) => clsKey(a) - clsKey(b) || a.localeCompare(b));
  if (!ks.length) return "\u{1F3EB} Abhi koi data nahi.";
  return cap("\u{1F3EB} <b>Saari classes</b>", ks.map(c => "\u2022 " + tgE(clsLabelEn(c)) + ": " + uniqN(g[c]) + " students \u00B7 " + g[c].length + " tests \u00B7 " + avg(g[c]) + "%"), "\u2139\uFE0F Kisi class ki detail: <b>class 5</b> likho");
}

function helpText() {
  return "\u2753 <b>Commands</b> (button dabao ya likho)\n\n" +
    "\u{1F441} <b>visitors</b> \u2014 website par kitne log\n" +
    "\u{1F4CA} <b>summary</b> \u2014 aaj ka hisaab \u00B7 <b>kal</b> \u2014 kal ka\n" +
    "\u{1F7E2} <b>live</b> \u2014 abhi test de rahe\n" +
    "\u{1F3C6} <b>toppers</b> \u2014 class toppers\n" +
    "\u{1F195} <b>recent</b> \u2014 aakhri 10 tests (recent 5 = 5 tests)\n" +
    "\u{1F3EB} <b>class 5</b> \u2014 us class ki report \u00B7 <b>classes</b> \u2014 sab ek nazar mein\n" +
    "\u{1F50D} <b>kisi ka naam</b> \u2014 uske saare results\n" +
    "\u{1F6A9} <b>flagged</b> \u2014 3+ leaves wale tests\n" +
    "\u{1F4DA} <b>subjects</b> \u2014 subject average, kamzor subject\n" +
    "\u{1F648} <b>absent</b> \u2014 aaj nahi aaye \u00B7 <b>inactive</b> \u2014 7 din se gayab\n" +
    "\u{1F4C5} <b>weekly</b> \u2014 hafte ki report\n" +
    "\u{1F3C5} <b>top</b> \u2014 top 10 \u00B7 <b>aaj top</b> \u2014 aaj ke top 10\n" +
    "\u{1F381} <b>inaam</b> \u2014 kise inaam dena hai\n" +
    "\u{1F3AF} <b>kareeb</b> \u2014 topper banne ke kareeb\n" +
    "\u26A1 <b>fastest</b> \u2014 sabse tez 30/30\n" +
    "\u{1F4F8} <b>photos</b> \u2014 HD photo ka status\n" +
    "\u{1F4F8} <b>photo rahul</b> \u2014 us student ki HD photo\n" +
    "\u{1F4F8} <b>photos class 5</b> \u2014 us class ki saari HD photo\n" +
    "\u{1F4F8} <b>allphotos</b> \u2014 sabki HD photo (15 album ek baar mein, phir allphotos 2)";
}

// ---------- HD PHOTOS (site ne jo original Telegram ko bheji, uski file_id Firebase mein rakhi hai) ----------
const pKey = (name, cls) => nk(name).replace(/[.$#\[\]\/]/g, "_") + "|" + cls;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tgApi(env, method, body, retry = true) {
  const j = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false }));
  if (retry && j && !j.ok && j.error_code === 429 && j.parameters && j.parameters.retry_after <= 20) { await sleep((j.parameters.retry_after + 1) * 1000); return tgApi(env, method, body, false); }
  return j;
}
async function loadPhotos() {
  const v = (await fb("testBotMeta/photos")) || {};
  return Object.values(v).filter(x => x && x.f && x.n).map(x => ({ f: x.f, k: x.k === "p" ? "p" : "d", n: String(x.n), c: String(x.c || ""), t: x.t || 0 }))
    .sort((a, b) => clsKey(a.c) - clsKey(b.c) || a.c.localeCompare(b.c) || a.n.localeCompare(b.n));
}
async function sendOne(env, chat, x) {
  const body = { chat_id: chat, caption: x.n + " (" + clsLabelEn(x.c) + ")" };
  body[x.k === "p" ? "photo" : "document"] = x.f;
  return tgApi(env, x.k === "p" ? "sendPhoto" : "sendDocument", body);
}
async function sendAlbum(env, chat, items) {
  if (items.length === 1) return (await sendOne(env, chat, items[0])).ok ? 1 : 0;
  const cap = items.map((x, i) => (i + 1) + ". " + x.n + " (" + clsLabelEn(x.c) + ")").join("\n").slice(0, 1000);
  const media = items.map((x, i) => Object.assign({ type: x.k === "p" ? "photo" : "document", media: x.f }, i === 0 ? { caption: cap } : {}));
  const r = await tgApi(env, "sendMediaGroup", { chat_id: chat, media });
  if (r && r.ok) return items.length;
  let ok = 0; for (const x of items) { if ((await sendOne(env, chat, x)).ok) ok++; await sleep(400); }
  return ok;
}
function photoCmd(raw) {
  const t = String(raw || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); let m;
  if (/^(photos?|fotos?|pics?|pictures?)$/.test(t)) return { t: "status" };
  if ((m = /^(?:all ?photos?|photos? all|sab photos?|all fotos?)(?: (\d{1,2}))?$/.exec(t))) return { t: "all", page: Number(m[1]) || 1 };
  if ((m = /^(?:photos?|fotos?|pics?) (?:class |cls )?(\d{1,2})(?: (\d{1,2}))?$/.exec(t)) || (m = /^(?:class|cls) (\d{1,2}) (?:photos?|fotos?|pics?)(?: (\d{1,2}))?$/.exec(t))) return { t: "cls", c: String(Number(m[1])), page: Number(m[2]) || 1 };
  if ((m = /^(?:photo|foto|pic|photos)\s+(.+)$/i.exec(String(raw || "").trim()))) return { t: "one", q: m[1] };
  return null;
}
async function doPhotos(env, chat, cmd) {
  const say = t => tgSend(env, chat, t), all = await loadPhotos();
  if (cmd.t === "status") {
    const by = {}; all.forEach(x => by[x.c] = (by[x.c] || 0) + 1);
    const cl = Object.keys(by).sort((a, b) => clsKey(a) - clsKey(b)).map(c => tgE(clsLabelEn(c)) + ": " + by[c]).join(" \u00B7 ");
    return say("\u{1F4F8} <b>HD photo saved: " + all.length + " students</b>" + (cl ? "\n" + cl : "") + "\n\n<b>photo rahul</b> \u2014 ek student\n<b>photos class 5</b> \u2014 ek class\n<b>allphotos</b> \u2014 sabhi\n\n\u2139\uFE0F Nayi photo site se apne aap save hoti hai. Purani photo ke liye: Telegram mein purane \"Naya student\" photo messages select karke is chat mein forward kar do (bot unhe pehchan kar save kar lega).");
  }
  let L = all, label = "Sabhi students";
  if (cmd.t === "one") { const q = nk(cmd.q); L = all.filter(x => nk(x.n).includes(q)).slice(0, 8); label = "\"" + tgE(cmd.q) + "\""; if (!L.length) return say("\u{1F4F8} \"" + tgE(cmd.q) + "\" ki HD photo bot ke paas nahi hai.\n\u2139\uFE0F Student ne photo nahi di, ya purani hai \u2014 <b>photos</b> likho, wahan batayi hai kaise save karni hai."); }
  if (cmd.t === "cls") { L = all.filter(x => x.c === cmd.c); label = clsLabelEn(cmd.c); if (!L.length) return say("\u{1F4F8} " + tgE(label) + " ki koi HD photo saved nahi."); }
  if (!L.length) return say("\u{1F4F8} Abhi koi HD photo saved nahi. <b>photos</b> likho.");
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const albums = chunk(L.filter(x => x.k === "d"), 10).concat(chunk(L.filter(x => x.k === "p"), 10));
  const PAGE = cmd.t === "one" ? 99 : 15, page = Math.max(1, cmd.page || 1), part = albums.slice((page - 1) * PAGE, page * PAGE);
  if (!part.length) return say("\u{1F4F8} Is page par kuch nahi. Total " + L.length + " photo, " + albums.length + " album.");
  await say("\u{1F4F8} <b>" + label + "</b> \u2014 HD photo bhej raha hoon (" + part.reduce((s, a) => s + a.length, 0) + " / " + L.length + ")\u2026");
  let sent = 0;
  for (let i = 0; i < part.length; i++) { sent += await sendAlbum(env, chat, part[i]); if (i < part.length - 1) await sleep(1100); }
  let tail = "\u2705 " + sent + " photo bheji.";
  if (albums.length > page * PAGE) tail += "\n\u27A1\uFE0F Agla hissa: <b>" + (cmd.t === "cls" ? "photos class " + cmd.c + " " : "allphotos ") + (page + 1) + "</b>";
  if (cmd.t !== "one") { // jinki HD photo nahi hai
    try {
      const have = new Set(all.map(x => pKey(x.n, x.c))), seen = {};
      (await loadResults()).forEach(r => { if (cmd.t === "cls" && r.cls !== cmd.c) return; const k = pKey(r.name, r.cls); if (!have.has(k)) seen[k] = r; });
      const miss = Object.values(seen).sort((a, b) => clsKey(a.cls) - clsKey(b.cls) || nk(a.name).localeCompare(nk(b.name)));
      if (miss.length && page === 1) tail += "\n\u26A0\uFE0F HD photo nahi (" + miss.length + "): " + miss.slice(0, 30).map(r => tgE(r.name) + " (" + tgE(clsLabelEn(r.cls)) + ")").join(", ") + (miss.length > 30 ? " \u2026" : "");
    } catch (e) {}
  }
  return say(tail);
}
// admin ne photo/file bheji (ya purane "Naya student" messages forward kiye) -> file_id save
async function savePhotoMsg(env, m) {
  const d = m.document && /^image\//.test(m.document.mime_type || "image/jpeg") ? m.document : null, ph = m.photo && m.photo.length ? m.photo[m.photo.length - 1] : null;
  const fid = d ? d.file_id : ph ? ph.file_id : ""; if (!fid) return null;
  const cap = String(m.caption || ""); let name = "", cls = "", mm;
  if ((mm = /\u{1F464}\s*(.+?)\s*\u00B7\s*([^\n]+)/u.exec(cap))) { name = mm[1]; cls = mm[2]; }
  else if ((mm = /^(.+?)\s*[|,\/]\s*(?:class\s*)?(\w{1,6})\s*$/i.exec(cap.trim()))) { name = mm[1]; cls = mm[2]; }
  name = name.trim(); cls = cls.trim().replace(/^class\s*/i, "");
  if (!name || !cls) return null;
  const at = ((m.forward_origin && m.forward_origin.date) || m.forward_date || m.date || 0) * 1000 || Date.now();
  const url = DB + "/testBotMeta/photos/" + encodeURIComponent(pKey(name, cls)) + ".json";
  const old = await fetch(url).then(r => r.json()).catch(() => null);
  if (old && old.t && old.t > at) return { name, cls, skipped: true };
  const r = await fetch(url, { method: "PUT", body: JSON.stringify({ f: fid, k: d ? "d" : "p", n: name, c: cls, t: at }) });
  if (!r.ok) throw new Error("firebase " + r.status);
  return { name, cls };
}

// ---------- kaunsa command ----------
async function answer(txt) {
  const raw = String(txt || "").trim();
  const t = raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  let m;
  if ((m = /^(?:class|cls|kaksha)\s*(\d{1,2})$/.exec(t)) || (m = /^(\d{1,2})$/.exec(t))) return classText(String(Number(m[1])));
  if (t === "start") return "\u2705 Menu ready. Neeche ke buttons dabao.\n\n" + helpText();
  if (/^(menu|help|madad|commands?)$/.test(t)) return helpText();
  if (/^(visitors?|visits?|views?|stats?|users?|kitne log|log)$/.test(t)) return visitText();
  if (/^(summary|aaj ka summary|aaj)$/.test(t)) return summaryText(0);
  if (/^(kal|kal ka summary|yesterday)$/.test(t)) return summaryText(1);
  if (/^(live|live abhi)$/.test(t)) return liveText();
  if (/^toppers?$/.test(t)) return toppersText();
  if ((m = /^(?:recent|latest|aakhri|new|naya)(?: (\d{1,2}))?$/.exec(t))) return recentText(Math.min(20, Number(m[1]) || 10));
  if (/^(flagged?|flags?|cheating|leaves?)$/.test(t)) return flaggedText();
  if (/^(subjects?|subject average|kamzor|weak)$/.test(t)) return subjectsText();
  if (/^(absent|nahi aaye|aaj nahi aaye)$/.test(t)) return absentText("absent");
  if (/^(inactive|gayab)$/.test(t)) return absentText("inactive");
  if (/^(weekly|week|hafta|saptah)$/.test(t)) return weeklyText();
  if ((m = /^(aaj )?top(?: (\d{1,2}))?$/.exec(t))) return topText(!!m[1], Math.min(20, Number(m[2]) || 10));
  if (/^(inaam|gift|prize|reward)s?$/.test(t)) return inaamText();
  if (/^(kareeb|close|near|almost)$/.test(t)) return kareebText();
  if (/^(fastest|tez|speed)$/.test(t)) return fastestText();
  if (/^(classes|class list|sab class|all class)$/.test(t)) return classesText();
  if (raw.length >= 2) return studentText(raw); // baaki sab = student ka naam
  return null;
}

async function tgSend(env, chat, text) {
  const url = "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage";
  const body = { chat_id: chat, text: String(text).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: KB };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { // HTML mein gadbad ho to saaf text bhej do
    body.text = String(text).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").slice(0, 4000);
    delete body.parse_mode;
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
}

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "POST") return new Response("Amrit bot chal raha hai \u2705");
    const CHAT = String(env.CHAT_ID || DEFAULT_CHAT);
    let u; try { u = await req.json(); } catch (e) { return new Response("ok"); }
    const m = u && u.message;
    if (!m || String(m.chat && m.chat.id) !== CHAT) return new Response("ok");
    try {
      // photo / file aayi (forward ki hui purani photo ya admin ne khud bheji)
      if (!m.text && (m.document || (m.photo && m.photo.length))) {
        const fwd = !!(m.forward_origin || m.forward_date), r = await savePhotoMsg(env, m);
        if (fwd) { if (r) await tgApi(env, "setMessageReaction", { chat_id: CHAT, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "\u{1F44D}" }] }); }
        else await tgSend(env, CHAT, r ? "\u2705 " + tgE(r.name) + " (" + tgE(clsLabelEn(r.cls)) + ") ki HD photo save ho gayi." : "\u2139\uFE0F Photo ke caption mein likho: <b>Naam | class</b> (jaise: Rahul | 5)");
        return new Response("ok");
      }
      if (!m.text) return new Response("ok");
      // Admin ne help-message ka reply diya (R:<id>) -> site ke "Madad" page par dikhane ke liye Firebase mein rakho
      const rt = m.reply_to_message && /R:([-\w]{12,30})/.exec(m.reply_to_message.text || "");
      if (rt) {
        await fetch(DB + "/testReplies/" + rt[1] + "/u" + u.update_id + ".json", { method: "PUT", body: JSON.stringify({ t: m.text.slice(0, 1000), at: (m.date || 0) * 1000 || Date.now() }) });
        return new Response("ok");
      }
      if (m.text.length > 40) return new Response("ok");
      const pc = photoCmd(m.text);
      if (pc) { // photo bhejna lamba kaam hai: Telegram ko turant "ok", baaki peeche chalta rahe
        const job = doPhotos(env, CHAT, pc).catch(async () => { try { await tgSend(env, CHAT, "\u26A0\uFE0F Photo bhejte waqt gadbad hui, thodi der baad dobara try karo."); } catch (e) {} });
        if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
        return new Response("ok");
      }
      const a = await answer(m.text);
      if (a) await tgSend(env, CHAT, a);
    } catch (e) { try { await tgSend(env, CHAT, "\u26A0\uFE0F Abhi data nahi mil paya, thodi der baad dobara dabao."); } catch (e2) {} }
    return new Response("ok");
  }
};
