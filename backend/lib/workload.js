"use strict";
/* Tính Workload / Capacity / trạng thái đầu việc ở PHÍA MÁY CHỦ – dùng cho bot Telegram (nhập tuần, nhắc,
   cảnh báo quá tải/vướng, tóm tắt tuần). Công thức gốc nằm ở frontend (core/constants.js, core/model.js):
   - Hằng số (QM_HOURS, PT_MULT, wlOf, ST_WEEK, OPEN, CAUSES…) nạp THẲNG từ frontend/js/core/constants.js bằng
     `vm` → một nguồn duy nhất, sửa hằng số ở frontend thì máy chủ dùng theo luôn.
   - Phần tổng hợp theo người/đầu việc viết lại ở đây, bám đúng model.js/derive():
       Capacity = 40 giờ/tuần cho mọi nhân sự
       Workload lượt nhập = e.hours; độ phức tạp chỉ tham khảo; lượt cũ chỉ có e.qm → wlOf(e.qm, e.pt)
       Trạng thái hiện tại của đầu việc = trạng thái ở lượt nhập tuần GẦN NHẤT có trạng thái, nếu chưa có
       lượt nào thì lấy t.init.status, mặc định "Chưa bắt đầu".
   Sửa công thức ở model.js thì nhớ sửa tương ứng ở đây. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const C = (() => {
  const ctx = {};
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "frontend", "js", "core", "constants.js"), "utf8");
  vm.runInContext(`${src}\n;this.__C = { QM_HOURS, PT_MULT, wlOf, ST_WEEK, ST_ALL, OPEN, CAUSES, QM_HINT, PT_HINT, TYPES, peopleOf, pOwners, pSes, tOwners, tCollabs };`, ctx);
  return ctx.__C;
})();

const r1 = x => Math.round(x * 10) / 10;
const capOf = s => 40;
const entryWl = e => e.hours != null ? r1(e.hours) : C.wlOf(e.qm, e.pt);
/* Quy mô (ước lượng, chỉ để tham khảo) suy ra từ số giờ thật – bot không hỏi riêng bước này; khớp khoảng giờ ở QM_HINT */
const qmFromHours = h => h <= 2 ? 1 : h <= 8 ? 2 : h <= 12 ? 3 : h <= 24 ? 4 : 5;
/* Tên ngắn của đầu việc (bỏ tiền tố "01. Hạng mục – "), khớp planShortName() ở frontend/js/views/plan.js */
const shortName = dv => (dv || "").replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/, "");

/* Thứ 2 của tuần chứa ngày d (giờ máy chủ), dạng YYYY-MM-DD – cùng cách tính mondayOfToday() ở server.js */
function mondayOf(d = new Date()) {
  const x = new Date(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

/* Đọc toàn bộ dữ liệu cần thiết một lần: nhân sự, dự án, các tuần từ `sinceWeek` */
async function loadData(store, sinceWeek) {
  const stRaw = await store.getDoc("config/staff");
  const staff = (stRaw ? JSON.parse(stRaw).list || [] : []).map(s => ({ ...s, cap: capOf(s) }));
  const projects = (await store.getDocs("projects")).map(r => ({ ...JSON.parse(r.body), id: r.doc_id }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name), "vi"));
  const weeks = (await store.getDocs("weeks", sinceWeek || null)).map(r => ({ ...JSON.parse(r.body), _id: r.doc_id }));
  return { staff, projects, weeks };
}

/* Map "projectId|taskId" → { status, week, person, e } của lượt nhập gần nhất có trạng thái */
function latestByTask(weeks) {
  const m = new Map();
  for (const w of weeks) for (const e of w.entries || []) {
    if (!e.status) continue;
    const k = e.projectId + "|" + e.taskId, cur = m.get(k);
    if (!cur || w.week > cur.week) m.set(k, { status: e.status, week: w.week, person: w.person, e });
  }
  return m;
}
function taskStatus(p, t, latest) {
  const l = latest.get(p.id + "|" + t.id);
  return l ? l.status : ((t.init && t.init.status) || "Chưa bắt đầu");
}
/* Dự án đã xong hết (mọi đầu việc chưa Hủy đều Hoàn thành) – khớp p._allDone ở model.js */
function projectDone(p, latest) {
  const live = (p.tasks || []).filter(t => taskStatus(p, t, latest) !== "Hủy");
  return live.length > 0 && live.every(t => taskStatus(p, t, latest) === "Hoàn thành");
}

/* Ngày hôm nay (giờ máy chủ) dạng YYYY-MM-DD và số ngày giữa 2 ngày ISO */
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

/* Thông tin hiện tại của 1 đầu việc – khớp phần p._tasks trong model.js/derive(): trạng thái và ma sát lấy theo
   lượt nhập tuần gần nhất (chưa có thì t.init), late/soon chỉ tính khi còn mở và dự án không phải Nội bộ. */
function taskInfo(p, t, latest, today = todayISO()) {
  const l = latest.get(p.id + "|" + t.id);
  const status = l ? l.status : ((t.init && t.init.status) || "Chưa bắt đầu");
  const ms = l ? (l.e.ms ?? null) : (t.init ? t.init.ms ?? null : null);
  const open = C.OPEN.has(status), internal = p.type === "Nội bộ";
  const late = !internal && open && !!t.deadline && t.deadline < today;
  const soon = !internal && open && !!t.deadline && t.deadline >= today && daysBetween(today, t.deadline) <= 14;
  return { t, p, status, ms, open, late, soon, stuck: open && (status === "Đang vướng" || (ms || 0) >= 1), wl: C.wlOf(t.qm, t.pt) };
}
/* Tóm tắt dự án – khớp p._prog / p._allDone / p._late / p._soon / p._stuck ở model.js. Tiến độ dùng trọng số
   t.wl ?? 1 (đầu việc thiếu Quy mô vẫn có trọng số 1) và bỏ đầu việc Hủy. */
function projectSummary(p, latest, today = todayISO()) {
  const tasks = (p.tasks || []).map(t => taskInfo(p, t, latest, today));
  const live = tasks.filter(x => x.status !== "Hủy");
  const tot = live.reduce((a, x) => a + (x.wl ?? 1), 0), dn = live.filter(x => x.status === "Hoàn thành").reduce((a, x) => a + (x.wl ?? 1), 0);
  return {
    p, tasks, prog: tot ? dn / tot : null, allDone: live.length > 0 && live.every(x => x.status === "Hoàn thành"),
    late: tasks.filter(x => x.late).length, soon: tasks.filter(x => x.soon).length, stuck: tasks.filter(x => x.stuck).length,
  };
}

/* Tổng Workload theo người trong 1 tuần (bỏ lượt Hủy), kèm Capacity → danh sách đủ cho cảnh báo/tóm tắt */
function loadByPerson(data, week) {
  const out = new Map(data.staff.map(s => [s.name, { name: s.name, cap: s.cap, wl: 0, hours: 0, n: 0 }]));
  for (const w of data.weeks) {
    if (w.week !== week) continue;
    const row = out.get(w.person) || { name: w.person, cap: 0, wl: 0, hours: 0, n: 0 };
    for (const e of w.entries || []) {
      if (e.status === "Hủy") continue;
      const wl = entryWl(e);
      if (wl != null) row.wl = r1(row.wl + wl);
      if (e.hours != null) row.hours = r1(row.hours + e.hours);
      row.n++;
    }
    out.set(w.person, row);
  }
  return [...out.values()];
}

/* Người của dự án/đầu việc dạng mảng (owners/ses/collabs, đọc được cả trường chuỗi cũ) – dùng chung hàm ở constants.js */
const { pOwners, pSes, tOwners, tCollabs } = C;

module.exports = { C, pOwners, pSes, tOwners, tCollabs, capOf, entryWl, qmFromHours, shortName, mondayOf, loadData, latestByTask, taskStatus, projectDone, loadByPerson, r1,
  todayISO, daysBetween, taskInfo, projectSummary };
