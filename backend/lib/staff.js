"use strict";
/* Đổi tên nhân sự / chuyển dữ liệu sang nhân sự khác – dùng bởi POST /api/staff/rename (server.js).
   Tên nhân sự là khoá nối dữ liệu (không có mã riêng): TM/SE của dự án, phụ trách/thực hiện của đầu việc,
   person + mã tài liệu của weeks/worklog (`<tuần>__<slug tên>`), kpiNote/kpiReview, staff_name của tài khoản. Chỉ sửa
   tên trong config/staff thì mọi dữ liệu cũ thành "mồ côi" – hàm này chuyển TẤT CẢ từ tên `from` sang `to`:
     - `from` có trong danh sách nhân sự, `to` chưa có → đổi tên người đó (kèm toàn bộ dữ liệu);
     - `from` không còn trong danh sách (đã bị đổi tên/xoá trước đây), `to` có → gắn dữ liệu mồ côi cho `to`.
   Trùng tuần ở weeks/worklog (cả 2 tên đều đã nhập) thì gộp, không ghi đè. Không bọc giao dịch (store.js
   không có), nhưng chạy lại cùng lệnh sẽ làm nốt phần còn dở vì mỗi bước chỉ đụng tài liệu còn mang tên cũ.
   Chỉ truy cập CSDL qua store (chạy được trên cả MariaDB lẫn SQLite). */

/* Dạng không dấu, gạch nối của 1 tên – dùng trong mã tài liệu weeks/worklog/kpiNote (khớp slug() ở frontend) */
function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";
}

/* Trả về { error: { status, message } } nếu không hợp lệ, hoặc { n } = số tài liệu đã chuyển theo từng loại */
async function renameStaff(store, fromRaw, toRaw, by) {
  const from = String(fromRaw ?? "").trim(), to = String(toRaw ?? "").trim();
  if (!from || !to || from === to || from.length > 120 || to.length > 120) return { error: { status: 400, message: "Tên nhân sự không hợp lệ" } };
  const n = { staff: 0, projects: 0, weeks: 0, worklog: 0, kpiNote: 0, kpiReview: 0, feedback: 0, users: 0 };
  const stRaw = await store.getDoc("config/staff"), st = stRaw ? JSON.parse(stRaw) : { list: [] };
  const list = st.list || [], hasFrom = list.some(s => s.name === from), hasTo = list.some(s => s.name === to);
  if (hasFrom && hasTo) return { error: { status: 409, message: `Đã có nhân sự tên “${to}”` } };
  if (!hasFrom && !hasTo) return { error: { status: 400, message: `Không có nhân sự nào tên “${to}” để nhận dữ liệu` } };
  if (hasFrom) {
    st.list = list.map(s => s.name === from ? { ...s, name: to } : s);
    await store.upsertDoc("config/staff", "config", "staff", JSON.stringify(st), by); n.staff = 1;
  }
  for (const r of await store.getDocs("projects")) {
    const p = JSON.parse(r.body); let changed = false;
    /* chuỗi cũ (owner/se/collab) và mảng mới (owners/ses/collabs): thay tên, bỏ trùng nếu người nhận đã có sẵn trong danh sách */
    const swap = (o, k) => {
      if (o[k] === from) { o[k] = to; changed = true; }
      if (Array.isArray(o[k + "s"]) && o[k + "s"].includes(from)) { o[k + "s"] = [...new Set(o[k + "s"].map(n => n === from ? to : n))]; changed = true; }
    };
    swap(p, "owner"); swap(p, "se");
    for (const t of p.tasks || []) { swap(t, "owner"); swap(t, "collab"); }
    if (changed) { await store.upsertDoc(`projects/${r.doc_id}`, "projects", r.doc_id, JSON.stringify(p), by); n.projects++; }
  }
  const mergeDays = (a = [], b = []) => {
    const m = new Map(a.map(d => [d.date, { ...d }]));
    for (const d of b) { const e = m.get(d.date); if (!e) m.set(d.date, { ...d }); else if (d.text) e.text = e.text ? `${e.text}\n${d.text}` : d.text; }
    return [...m.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)));
  };
  for (const coll of ["weeks", "worklog"]) {
    for (const r of await store.getDocs(coll)) {
      const b = JSON.parse(r.body); if (b.person !== from) continue;
      const id = `${b.week}__${slug(to)}`, exRaw = id === r.doc_id ? null : await store.getDoc(`${coll}/${id}`);
      let body = { ...b, person: to };
      if (exRaw) {
        const ex = JSON.parse(exRaw);
        body = coll === "weeks" ? { ...ex, entries: [...(ex.entries || []), ...(b.entries || [])] } : { ...ex, days: mergeDays(ex.days, b.days) };
      }
      await store.upsertDoc(`${coll}/${id}`, coll, id, JSON.stringify(body), by);
      if (id !== r.doc_id) await store.deleteDoc(`${coll}/${r.doc_id}`);
      n[coll]++;
    }
  }
  for (const coll of ["kpiNote", "kpiReview"]) { // mã: <kỳ>__<slug tên>
    for (const r of await store.getDocs(coll)) {
      const b = JSON.parse(r.body); if (b.person !== from) continue;
      const suffix = `__${slug(from)}`, id = r.doc_id.endsWith(suffix) ? r.doc_id.slice(0, -suffix.length) + `__${slug(to)}` : r.doc_id;
      await store.upsertDoc(`${coll}/${id}`, coll, id, JSON.stringify({ ...b, person: to }), by);
      if (id !== r.doc_id) await store.deleteDoc(`${coll}/${r.doc_id}`);
      n[coll]++;
    }
  }
  for (const coll of ["feedback", "feedbackReply", "events"]) for (const r of await store.getDocs(coll)) { // person chỉ là nhãn người gửi – đổi theo cho khớp tên mới
    const b = JSON.parse(r.body); if (b.person !== from) continue;
    await store.upsertDoc(`${coll}/${r.doc_id}`, coll, r.doc_id, JSON.stringify({ ...b, person: to }), by); n.feedback++;
  }
  for (const u of await store.listUsers()) if (u.staff_name === from) { await store.updateUser(u.id, { staff_name: to }); n.users++; }
  return { n, from, to };
}

module.exports = { slug, renameStaff };
