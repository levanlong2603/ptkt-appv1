"use strict";
/*
 * MODULE VÍ DỤ: SỔ RỦI RO DỰ ÁN
 * ------------------------------------------------------------
 * Minh hoạ đầy đủ cách thêm 1 module mới:
 *   1. Nghe dữ liệu từ máy chủ (ON_SESSION)
 *   2. Vẽ màn hình (registerView)
 *   3. Form thêm / sửa / xoá (openForm + write/remove)
 *   4. Xử lý nút bấm (ACTIONS)
 * Cần thêm ở máy chủ (server.js → RULES):   risks: "member",
 */

/* ---------- 1. DỮ LIỆU ---------- */
S.risks = [];                                   // nơi giữ dữ liệu module trong bộ nhớ trình duyệt
ON_SESSION.push(db => {                         // chạy mỗi khi đăng nhập xong
  db.collection("risks").onSnapshot(snap => {   // tự cập nhật khi ai đó thêm/sửa
    S.risks = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    schedule();                                 // yêu cầu vẽ lại màn hình
  });
});

const RISK_LEVELS = { 1: ["mute", "Thấp"], 2: ["warn", "Trung bình"], 3: ["bad", "Cao"] };
const RISK_STATUS = ["Đang mở", "Đã xử lý"];

/* ---------- 2. MÀN HÌNH ---------- */
function viewRisks() {
  const list = [...S.risks].sort((a, b) =>
    (a.status === "Đã xử lý") - (b.status === "Đã xử lý") || (b.level || 0) - (a.level || 0) || String(a.due || "9").localeCompare(String(b.due || "9")));
  const open = list.filter(r => r.status !== "Đã xử lý");
  const high = open.filter(r => r.level === 3).length;
  const late = open.filter(r => r.due && r.due < M.today).length;

  let h = `<div class="head"><div><h1>Rủi ro dự án</h1><div class="sub">Ghi nhận và theo dõi rủi ro trước khi thành vướng mắc</div></div>
    <button class="btn primary" data-act="risk-add">+ Rủi ro</button></div>`;
  h += `<div class="band">
    <div class="stat"><div class="v">${open.length}</div><div class="l">Rủi ro đang mở</div></div>
    <div class="stat ${high ? "bad" : ""}"><div class="v">${high}</div><div class="l">Mức cao</div></div>
    <div class="stat ${late ? "warn" : ""}"><div class="v">${late}</div><div class="l">Quá hạn xử lý</div></div></div>`;
  if (!list.length) return h + `<section class="panel"><div class="empty"><b>Chưa có rủi ro nào</b>Bấm “+ Rủi ro” để ghi nhận.</div></section>`;
  h += `<section class="panel tbl-wrap"><table><thead><tr><th>Dự án</th><th>Rủi ro</th><th>Mức độ</th><th>Người theo dõi</th><th>Hạn xử lý</th><th>Trạng thái</th></tr></thead><tbody>`;
  for (const r of list) {
    const p = M.pById.get(r.projectId);
    const lv = RISK_LEVELS[r.level] || ["mute", "–"];
    h += `<tr class="click" data-act="risk-edit" data-id="${esc(r.id)}" tabindex="0">
      <td>${esc(p ? p.name : "–")}</td>
      <td><div class="cell-main">${esc(r.title)}</div>${r.note ? `<div class="cell-sub">${esc(r.note)}</div>` : ""}</td>
      <td><span class="pill ${lv[0]}">${lv[1]}</span></td>
      <td>${esc(r.owner || "–")}</td>
      <td style="${r.due && r.due < M.today && r.status !== "Đã xử lý" ? "color:var(--bad);font-weight:600" : ""}">${r.due ? dmy(r.due) : "–"}</td>
      <td>${r.status === "Đã xử lý" ? '<span class="pill ok">Đã xử lý</span>' : '<span class="pill info">Đang mở</span>'}</td></tr>`;
  }
  return h + `</tbody></table></section>`;
}

/* ---------- 3. FORM ---------- */
function riskForm(r) {
  const isNew = !r;
  const v = r ? { ...r } : { projectId: "", title: "", level: 2, owner: S.me || "", due: null, status: "Đang mở", note: "" };
  openForm({
    title: isNew ? "Ghi nhận rủi ro" : "Sửa rủi ro",
    values: v,
    fields: [
      { key: "projectId", label: "Dự án", type: "select", options: M.projects.map(p => [p.id, p.name]), required: true },
      { key: "title", label: "Mô tả rủi ro", type: "text", required: true },
      { key: "level", label: "Mức độ", type: "seg", options: [[1, "Thấp"], [2, "Trung bình"], [3, "Cao"]] },
      { key: "owner", label: "Người theo dõi", type: "select", options: [["", ""], ...M.staff.map(s => [s.name, s.name])], half: true },
      { key: "due", label: "Hạn xử lý", type: "date", half: true },
      { key: "status", label: "Trạng thái", type: "seg", options: RISK_STATUS.map(s => [s, s]) },
      { key: "note", label: "Biện pháp phòng ngừa / ghi chú", type: "textarea" },
    ],
    saveLabel: isNew ? "Ghi nhận" : "Lưu",
    onSave: async x => {
      const id = r ? r.id : uid("r");
      await write("risks/" + id, {
        projectId: x.projectId, title: x.title.trim(), level: x.level || 2, owner: x.owner || "",
        due: x.due || null, status: x.status || "Đang mở", note: x.note || "",
        createdBy: r ? r.createdBy : (S.user ? S.user.display_name : ""),
      });
      toast(isNew ? "Đã ghi nhận rủi ro" : "Đã lưu");
    },
    onDelete: isNew ? null : async () => {
      if (!confirm("Xoá rủi ro này?")) return false;
      await remove("risks/" + r.id); toast("Đã xoá");
    },
  });
}

/* ---------- 4. NÚT BẤM ---------- */
ACTIONS["risk-add"] = () => riskForm(null);
ACTIONS["risk-edit"] = el => { const r = S.risks.find(x => x.id === el.dataset.id); if (r) riskForm(r); };

/* ---------- 5. ĐĂNG KÝ VÀO MENU ---------- */
registerView({
  id: "risks",
  label: "Rủi ro dự án",
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  render: viewRisks,
});
