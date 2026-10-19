"use strict";
/* Màn hình: Dự án – 1 trang duy nhất (đã gộp "Tổng quan dự án" và "Kế hoạch dự án"): danh sách + thống kê (dashContent),
   người quản lý có thêm "+ Dự án mới"/"Nhập từ Excel". Bấm 1 dự án → trang riêng của dự án đó (S.openProject,
   projectPage() bên dưới) với bảng đầu việc đầy đủ (planDetail ở plan.js) để xem/sửa/đánh giá. */
function viewProject(){
  const cur = S.openProject && M.pById.get(S.openProject);
  if(cur) return projectPage(cur);
  S.openProject = null;
  /* 1 trang duy nhất (đã gộp tab "Kế hoạch dự án" vào đây): danh sách + thống kê, thêm "+ Dự án mới"/"Nhập từ Excel" cho
     người quản lý; bấm 1 dự án mở trang riêng của nó (bảng đầu việc đầy đủ, sửa/đánh giá/thêm đầu việc) */
  return `<div class="head"><div><h1>Dự án</h1></div><div class="ex-ctl">${dashToolbar()}</div></div>` + dashContent();
}
/* Thanh điều khiển giống hệt Dashboard (ô kỳ + Tuần/Tháng/Quý + Tổng thể/Cá nhân + làm mới) – tab này
   chưa dùng kỳ để lọc gì, chỉ thêm sẵn cho đồng bộ giao diện, dùng chung S.week/S.period/periodInfo()/
   exnav/exper (exec-dashboard.js, events.js) với Dashboard nên đổi kỳ ở đâu cũng khớp nơi khác. */
function dashToolbar(){
  const kind = S.period || "week", per = periodInfo(S.week, kind);
  return `<div class="ex-wk"><button data-act="exnav" data-d="-1" aria-label="Kỳ trước">‹</button><div class="lb">${esc(per.label)}</div><button data-act="exnav" data-d="1" aria-label="Kỳ sau">›</button></div>
    <div class="ex-seg" role="group" aria-label="Kỳ báo cáo">${[["week","Tuần"],["month","Tháng"],["quarter","Quý"]].map(([k,l])=>`<button data-act="exper" data-k="${k}" aria-pressed="${kind===k}">${l}</button>`).join("")}</div>
    ${scopeToggleHtml()}
    <button class="btn icon" data-act="exrefresh" title="Làm mới" aria-label="Làm mới">${ICONS.refresh}</button>`;
}
function dashContent(){
  /* Trưởng phòng/phó phòng/admin chọn một người cụ thể ở "Tôi là" (không phải "Tất cả") → chỉ thấy dự án
     người đó là TM/SE, như đang xem thay họ. Nhân viên tự đăng nhập: mặc định vẫn thấy cả phòng, nhưng có
     thể tự bật "Cá nhân" (nút scopeToggleHtml() ở toolbar chung) để thu hẹp về đúng dự án của mình. */
  const simAs = effectiveSimAs();
  const P = M.projects.filter(p => p.type!=="Nội bộ" && (!simAs || projectAssigned(p, simAs)));
  const allT = M.tasks.filter(t=>t.p.type!=="Nội bộ" && (!simAs || projectAssigned(t.p, simAs)));
  const late = allT.filter(t=>t.warns.some(w=>w[1]==="Quá hạn"));
  const soon = allT.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn"));
  const stuck = allT.filter(t=>OPEN.has(t.status) && (t.status==="Đang vướng"||(t.ms||0)>=1));
  const running = t => P.filter(p=>p.type===t && (p._prog==null || p._prog<1)).length;
  const q = (S.dashQuery||"").toLowerCase();
  let h = `<div class="head-ctl" style="margin-bottom:16px">
      <div class="chips" role="group" aria-label="Lọc theo loại">${PLAN_FILTERS.map(f=>`<button class="chip-btn" data-act="tf" data-t="${esc(f.key)}" aria-pressed="${S.typeFilter===f.key}">${esc(f.label)}</button>`).join("")}</div>
      <input class="inp" type="search" placeholder="Tìm dự án" style="width:180px" data-act="dashq" value="${esc(S.dashQuery||"")}" aria-label="Tìm dự án">
      ${S.canEdit?'<button class="btn primary" data-act="newp">+ Dự án mới</button><button class="btn" data-act="planimport" title="Tạo dự án mới từ bảng theo dõi dự án (.xlsx): Hạng mục, Đầu việc, Chi tiết thực hiện, Deadline, Trạng thái, Vướng mắc, Hướng giải quyết">Nhập từ Excel</button>':""}
    </div>`;
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
    const ps = P.filter(p=>planMatchFilter(p, f.key) && (!q || p.name.toLowerCase().includes(q))).sort((a,b)=>(b._stuck-a._stuck) || (b._late-a._late) || a.name.localeCompare(b.name,"vi"));
    left += `<section class="panel"><div class="panel-h"><h2>${typeDot(f.type)}${esc(f.label)} <span class="muted small">· ${ps.length}</span></h2></div>`;
    if(!ps.length) left += `<div class="empty">${q?`Không có ${f.label.toLowerCase()} nào khớp “${esc(S.dashQuery)}”.`:`Chưa có ${f.label.toLowerCase()} nào.${S.canEdit?" Bấm “+ Dự án mới” để thêm.":""}`}</div>`;
    for(const p of ps){
      left += `<div class="prow" data-act="openp" data-id="${esc(p.id)}" role="button" tabindex="0">
        <div><div class="nm">${esc(p.name)}</div><div class="ow">${esc(p.owner||"Chưa có người phụ trách")}</div></div>
        <div><div class="pct">${pct(p._prog)}</div><div class="pbar"><i style="width:${Math.round((p._prog||0)*100)}%"></i></div></div>
        <div class="next small"><div class="muted">Mốc tiếp theo</div><div style="font-weight:600">${p._next?dmy(p._next):"–"}</div></div>
        <div class="strip-cell">${strip(p, "openProject")}</div>
        <div class="badges">${projBadges(p)}</div>
      </div>`;
    }
    left += `</section>`;
  }
  /* Dự án loại Nội bộ ("Việc chung của phòng") không nằm trong thống kê/bộ lọc ở trên, nhưng người quản lý vẫn cần mở để
     sửa các đầu việc chung của phòng (trước đây thấy ở tab Kế hoạch dự án) – hiện thêm 1 khối riêng khi lọc "Tất cả" */
  if(S.canEdit && S.typeFilter==="Tất cả"){
    const ins = M.projects.filter(p=>p.type==="Nội bộ" && (!q || p.name.toLowerCase().includes(q)));
    if(ins.length) left += `<section class="panel"><div class="panel-h"><h2>${typeDot("Nội bộ")}Nội bộ <span class="muted small">· ${ins.length}</span></h2></div>${ins.map(p=>`<div class="prow" data-act="openp" data-id="${esc(p.id)}" role="button" tabindex="0">
        <div><div class="nm">${esc(p.name)}</div><div class="ow">${(p.tasks||[]).length} đầu việc dùng chung</div></div>
      </div>`).join("")}</section>`;
  }
  return h + left;
}
function projBadges(p){
  return `${p._late?`<span class="pill bad">${p._late} quá hạn</span>`:""}${p._stuck?`<span class="pill warn">${p._stuck} vướng</span>`:""}${p._soon?`<span class="pill info">${p._soon} sắp hạn</span>`:""}${!(p.tasks||[]).length?'<span class="pill mute">Chưa có đầu việc</span>':!p._late&&!p._stuck&&!p._soon?'<span class="pill ok">Đúng tiến độ</span>':""}`;
}
/* Trang riêng của 1 dự án: thanh thông tin + nút quay lại kiểu "Việc trong tuần" (.me-sum), bên dưới là
   đúng khối planDetail() của tab Kế hoạch dự án (bảng đầu việc, thu/phóng, + Đầu việc, Sửa thông tin, Xoá
   dự án, bấm dòng để sửa/đánh giá) – quyền vẫn do canManageProject()/taskForm() quyết định như ở tab đó,
   người không có quyền bấm vào dòng chỉ mở được popup xem. */
function projectPage(p){
  const cell = (label, val) => `<div><div class="small muted">${label}</div><div style="font-weight:700; font-size:17px">${val}</div></div>`;
  /* Trang riêng của dự án vẫn giữ thanh kỳ Tuần/Tháng/Quý + Làm mới ở hàng tiêu đề như 2 tab của màn Dự án (cùng
     toolbar với tab Tổng quan – dashToolbar()), để đổi kỳ ngay khi đang xem 1 dự án mà không phải quay lại */
  return `<div class="head"><div><h1>Dự án</h1></div><div class="ex-ctl">${dashToolbar()}</div></div>
    <section class="panel" style="margin-bottom:18px"><div class="panel-b me-sum me-sum-end">
      ${cell("Dự án", typeDot(p.type)+esc(p.name))}
      ${cell("Phụ trách", esc(p.owner||"–"))}
      ${cell("SE", esc(p.se||"–"))}
      ${cell("Tiến độ", pct(p._prog))}
      ${cell("Mốc tiếp theo", p._next?dmy(p._next):"–")}
      <div class="badges">${projBadges(p)}</div>
      <div class="toolbar" style="margin-left:auto"><button class="btn" data-act="projback">← Quay lại tổng quan</button></div>
    </div></section>
    <section class="panel">${planDetail(p, true)}</section>`;
}
ACTIONS["projback"] = () => { S.openProject = null; render(); };


VIEW_RENDER.dash = viewProject;
