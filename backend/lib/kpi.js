"use strict";
/* Bản đánh giá KPI theo người + kỳ (collection kpiReview) – dùng bởi các route /api/kpi/review* ở server.js.
   Tài liệu: kpiReview/<kind>-<mã kỳ>__<slug tên>
     { person, kind, key, label, status:"draft"|"locked", note, evidence,
       snapshot: null | { scores, kpi, wsum, rating, weights, thresholds, nEntries, nTasks, basis, computedAt },
       lockedAt, lockedBy, updatedAt, updatedBy,
       history: [ { ts, by, action:"create"|"lock"|"unlock", reason?, kpi?, snapshot? } ] }
   Nguyên tắc:
     - Trình duyệt KHÔNG gửi điểm: khi chốt, máy chủ tự đọc dữ liệu gốc và tính lại bằng đúng bộ mã mà trình
       duyệt dùng để hiển thị (frontend/js/modules/kpi-calc.js), kèm trọng số/ngưỡng đang hiệu lực lúc chốt.
     - Đã chốt thì không sửa nhận xét/minh chứng được nữa; muốn điều chỉnh phải "mở lại" kèm lý do – máy chủ
       ghi người thực hiện, thời điểm, lý do và giữ lại bản điểm vừa bị mở trong history.
     - history/lockedBy/updatedBy luôn do máy chủ ghi, không nhận từ trình duyệt.
   Chỉ truy cập CSDL qua store (chạy được trên cả MariaDB lẫn SQLite). */
const KPI = require("../../frontend/js/modules/kpi-calc.js");

const fail = (status, message) => ({ error: { status, message } });
const text = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

async function context(store, b) {
  const period = KPI.KINDS.includes(b && b.kind) ? KPI.periodByKey(b.kind, b.key) : null;
  if (!period) return fail(400, "Kỳ đánh giá không hợp lệ");
  const person = String((b && b.person) ?? "").trim();
  const stRaw = await store.getDoc("config/staff"), staff = stRaw ? (JSON.parse(stRaw).list || []) : [];
  if (!person || !staff.some(s => s.name === person)) return fail(400, "Không có nhân sự này");
  const id = KPI.reviewId(period.kind, period.key, person), path = `kpiReview/${id}`;
  const raw = await store.getDoc(path);
  return { period, person, staff, id, path, doc: raw ? JSON.parse(raw) : null };
}
const blank = (c, by, now) => ({ person: c.person, kind: c.period.kind, key: c.period.key, label: c.period.label, status: "draft", note: "", evidence: "",
  snapshot: null, lockedAt: null, lockedBy: null, updatedAt: now, updatedBy: by, history: [{ ts: now, by, action: "create" }] });
const put = (store, c, doc, by) => store.upsertDoc(c.path, "kpiReview", c.id, JSON.stringify(doc), by);

/* Lưu nhận xét + minh chứng của quản lý (tạo bản nháp nếu chưa có) */
async function saveReview(store, by, b) {
  const c = await context(store, b); if (c.error) return c;
  if (c.doc && c.doc.status === "locked") return fail(409, "Bản đánh giá đã chốt – mở lại trước khi sửa");
  const now = new Date().toISOString(), doc = c.doc || blank(c, by, now);
  doc.note = text(b.note, 8000); doc.evidence = text(b.evidence, 8000); doc.updatedAt = now; doc.updatedBy = by;
  await put(store, c, doc, by);
  return { doc, id: c.id };
}
/* Chốt: máy chủ tính lại điểm từ dữ liệu gốc rồi lưu ảnh chụp */
async function lockReview(store, by, b) {
  const c = await context(store, b); if (c.error) return c;
  if (c.doc && c.doc.status === "locked") return fail(409, "Bản đánh giá này đã chốt rồi");
  const crRaw = await store.getDoc("config/kpiCriteria"), criteria = crRaw ? JSON.parse(crRaw) : KPI.DEFAULT;
  const rows = async coll => (await store.getDocs(coll)).map(r => ({ ...JSON.parse(r.body), id: r.doc_id }));
  const ix = KPI.prepare({ staff: c.staff, projects: await rows("projects"), weeks: await rows("weeks") });
  const r = KPI.compute(ix, c.person, c.period.weeks, criteria), rt = KPI.rating(r.kpi, criteria);
  const now = new Date().toISOString(), doc = c.doc || blank(c, by, now);
  doc.snapshot = { scores: r.scores, kpi: r.kpi, wsum: r.wsum, rating: rt ? rt.label : null, weights: criteria.weights, thresholds: criteria.thresholds,
    nEntries: r.nEntries, nTasks: r.nTasks, basis: r.basis, computedAt: now };
  doc.status = "locked"; doc.lockedAt = now; doc.lockedBy = by; doc.updatedAt = now; doc.updatedBy = by;
  doc.history = [...(doc.history || []), { ts: now, by, action: "lock", kpi: r.kpi }];
  await put(store, c, doc, by);
  return { doc, id: c.id };
}
/* Mở lại để điều chỉnh: bắt buộc có lý do; bản điểm vừa mở được giữ trong history */
async function unlockReview(store, by, b) {
  const c = await context(store, b); if (c.error) return c;
  if (!c.doc || c.doc.status !== "locked") return fail(409, "Bản đánh giá này chưa chốt");
  const reason = text(b.reason, 1000); if (!reason) return fail(400, "Cần ghi lý do mở lại");
  const now = new Date().toISOString(), doc = c.doc;
  doc.history = [...(doc.history || []), { ts: now, by, action: "unlock", reason, kpi: doc.snapshot ? doc.snapshot.kpi : null, snapshot: doc.snapshot }];
  doc.status = "draft"; doc.snapshot = null; doc.lockedAt = null; doc.lockedBy = null; doc.updatedAt = now; doc.updatedBy = by;
  await put(store, c, doc, by);
  return { doc, id: c.id };
}

module.exports = { saveReview, lockReview, unlockReview };
