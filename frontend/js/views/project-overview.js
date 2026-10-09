"use strict";
/* Màn hình: dashboard */
/* ================= VIEW: dashboard ================= */
function viewDash(){
  /* Trưởng phòng chọn một người cụ thể ở "Tôi là" (không phải "Tất cả") → chỉ thấy dự án người đó là TM/SE,
     như đang xem thay họ. Tài khoản nhân viên tự đăng nhập thì không bị thu hẹp, vẫn thấy cả phòng. */
  const simAs = (S.canEdit && S.me && S.me!=="__all__") ? S.me : null;
  const P = M.projects.filter(p => p.type!=="Nội bộ" && (!simAs || projectAssigned(p, simAs)));
  const allT = M.tasks.filter(t=>t.p.type!=="Nội bộ" && (!simAs || projectAssigned(t.p, simAs)));
  const late = allT.filter(t=>t.warns.some(w=>w[1]==="Quá hạn"));
  const soon = allT.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn"));
  const stuck = allT.filter(t=>OPEN.has(t.status) && (t.status==="Đang vướng"||(t.ms||0)>=1));
  const running = t => P.filter(p=>p.type===t && (p._prog==null || p._prog<1)).length;
  let h = `<div class="head"><div><h1>Tổng quan dự án</h1>${simAs?`<div class="sub">Đang xem riêng: ${esc(simAs)}</div>`:""}</div>
    <div class="chips" role="group" aria-label="Lọc theo loại">${PLAN_FILTERS.map(f=>`<button class="chip-btn" data-act="tf" data-t="${esc(f.key)}" aria-pressed="${S.typeFilter===f.key}">${esc(f.label)}</button>`).join("")}</div></div>`;
  h += `<div class="band">
    <div class="stat"><div class="v">${running("Triển khai")}</div><div class="l">${typeDot("Triển khai")}Dự án triển khai đang chạy</div></div>
    <div class="stat"><div class="v">${running("Thầu")}</div><div class="l">${typeDot("Thầu")}Gói thầu đang làm</div></div>
    <div class="stat ${late.length?"bad":""}"><div class="v">${late.length}</div><div class="l">Đầu việc quá hạn</div></div>
    <div class="stat ${soon.length?"warn":""}"><div class="v">${soon.length}</div><div class="l">Đến hạn trong 14 ngày</div></div>
    <div class="stat ${stuck.length?"warn":""}"><div class="v">${stuck.length}</div><div class="l">Đầu việc đang vướng</div></div></div>`;
  let left = "";
  for(const f of PLAN_FILTERS){
    if(f.key==="Tất cả") continue;
    if(S.typeFilter!=="Tất cả" && S.typeFilter!==f.key) continue;
    const ps = P.filter(p=>planMatchFilter(p, f.key)).sort((a,b)=>(b._stuck-a._stuck) || (b._late-a._late) || a.name.localeCompare(b.name,"vi"));
    left += `<section class="panel"><div class="panel-h"><h2>${typeDot(f.type)}${esc(f.label)} <span class="muted small">· ${ps.length}</span></h2></div>`;
    if(!ps.length) left += `<div class="empty">Chưa có ${f.label.toLowerCase()} nào. Thêm ở mục Kế hoạch dự án.</div>`;
    for(const p of ps){
      const open = S.openProject===p.id;
      left += `<div class="prow" data-act="openp" data-id="${esc(p.id)}" role="button" tabindex="0" aria-expanded="${open}">
        <div><div class="nm">${esc(p.name)}</div><div class="ow">${esc(p.owner||"Chưa có người phụ trách")}</div></div>
        <div><div class="pct">${pct(p._prog)}</div><div class="pbar"><i style="width:${Math.round((p._prog||0)*100)}%"></i></div></div>
        <div class="next small"><div class="muted">Mốc tiếp theo</div><div style="font-weight:600">${p._next?dmy(p._next):"–"}</div></div>
        <div class="strip-cell">${strip(p)}</div>
        <div class="badges">${p._late?`<span class="pill bad">${p._late} quá hạn</span>`:""}${p._stuck?`<span class="pill warn">${p._stuck} vướng</span>`:""}${p._soon?`<span class="pill info">${p._soon} sắp hạn</span>`:""}${!(p.tasks||[]).length?'<span class="pill mute">Chưa có đầu việc</span>':!p._late&&!p._stuck&&!p._soon?'<span class="pill ok">Đúng tiến độ</span>':""}</div>
      </div>`;
      if(open) left += projectDetail(p);
    }
    left += `</section>`;
  }
  return h + left;
}
function projectDetail(p){
  /* data-act="dashtask" → luôn mở xem (openInfo), không bao giờ mở form sửa, kể cả trưởng phòng: Tổng quan dự án chỉ để xem */
  const dashRow = (t,i,lvl=1) => { const idle = t.status==="Chưa bắt đầu"; return `<tr class="click${idle?" tr-idle":""}" data-act="dashtask" data-pid="${esc(p.id)}" data-id="${esc(t.id)}" tabindex="0" title="${esc(t.dv)}"><td style="padding-left:${10+lvl*32}px"><div class="cell-main">${esc(planShortName(t.dv))}</div>${t.detail&&!idle?`<div class="cell-sub">${esc(t.detail)}</div>`:""}${t.upd?`<div class="cell-sub">${esc(t.upd)}</div>`:""}${t.note?`<div class="cell-sub" style="color:var(--teal)">Ghi chú TrP: ${esc(t.note)}</div>`:""}</td>
    <td>${esc(t.owner||"–")}</td><td>${t.deadline?dmy(t.deadline):"–"}</td><td>${stPill(t.status)}</td>
    <td>${warnPills(t.warns)}</td></tr>`; };
  const rows = planTreeRows(p, {scope:"dash|"+p.id, cols:5, row:dashRow, edit:false});
  return `<div class="pdetail">
    <div class="row2" style="margin:12px 0">
      <div><div class="small muted" style="margin-bottom:4px">Mốc hợp đồng</div><div class="note">${esc(p.milestones||"–")}</div></div>
      <div><div class="small muted" style="margin-bottom:4px">Tình hình / vướng mắc chung</div><div class="note">${esc(p.situation||"–")}</div></div></div>
    <div class="tbl-wrap panel"><table style="table-layout:fixed"><thead><tr><th style="width:40%">Đầu việc</th><th style="width:16%">Phụ trách</th><th style="width:12%">Deadline</th><th style="width:16%">Trạng thái</th><th style="width:16%">Cảnh báo</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="muted">Chưa có đầu việc.</td></tr>'}</tbody></table></div>
    <div style="margin-top:10px"><button class="btn" data-act="goplan" data-id="${esc(p.id)}">Mở kế hoạch dự án</button></div></div>`;
}


VIEW_RENDER.dash = viewDash;
