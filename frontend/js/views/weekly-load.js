"use strict";
/* Màn hình: weekly load */
/* ================= VIEW: weekly load ================= */
function loadFor(name, week){
  const es = M.entries.filter(e=>e.person===name && e.week===week);
  const byType = {}; let wl=0, missing=0;
  /* Đầu việc Hủy không tính vào workload (và mức sử dụng) của tuần, dù vẫn hiện trong danh sách (es)
     để xem lại việc đã làm. Đầu việc Hoàn thành vẫn tính vào tổng. */
  for(const e of es){
    if(e.status==="Hủy") continue;
    if(e.wl==null){ missing++; continue; }
    wl+=e.wl; byType[e.type]=(byType[e.type]||0)+e.wl;
  }
  return {es, wl, byType, missing};
}
function viewLoad(){
  const w = S.week;
  /* Trưởng phòng chọn một người cụ thể ở "Tôi là" (không phải "Tất cả") → trang này chỉ còn tính riêng người đó,
     như đang xem thay họ. Tài khoản nhân viên tự đăng nhập thì không bị thu hẹp, vẫn thấy cả phòng như trước. */
  const simAs = (S.canEdit && S.me && S.me!=="__all__") ? S.me : null;
  const staffList = simAs ? M.staff.filter(s=>s.name===simAs) : M.staff;
  const rows = staffList.map(s => {
    const L = loadFor(s.name, w);
    const u = s.cap ? L.wl/s.cap : null;
    const hist = [-21,-14,-7,0].map(d => { const x=loadFor(s.name, addDays(w,d)); return x.es.length && s.cap ? x.wl/s.cap : null; });
    const state = !L.es.length ? ["mute","Chưa nhập tuần"] : L.missing ? ["mute","Thiếu quy mô"] : u>1 ? ["bad","Quá tải"] : u>=.8 ? ["warn","Tải cao"] : ["ok","Còn khả năng"];
    return {s, L, u, hist, state};
  });
  const entered = rows.filter(r=>r.L.es.length);
  const capE = entered.reduce((a,r)=>a+r.s.cap,0), wlE = entered.reduce((a,r)=>a+r.L.wl,0);
  const wkE = M.entries.filter(e=>e.week===w && (!simAs || e.person===simAs));
  const done = wkE.filter(e=>e.status==="Hoàn thành").length;
  const blocked = wkE.filter(e=>e.status==="Đang vướng" || (e.ms||0)>=3);
  const over = rows.filter(r=>r.u>1).length;
  /* Tỉ lệ hoàn thành = workload Hoàn thành / tổng workload trong tuần (Hủy không tính, giống loadFor()).
     Tuần hiện tại: tính real-time, đổi theo mỗi lần ai đó cập nhật trạng thái. Tuần cũ: dữ liệu đã khoá
     (nhân viên không sửa được nữa) nên tỉ lệ tự nhiên giữ nguyên như lúc tuần đó kết thúc, không cần xử lý
     riêng. Chưa có dữ liệu thì để 0%, không lấy số của tuần trước để tránh nhầm lẫn. */
  const ratioOf = es => { const doneWl=es.filter(e=>e.status==="Hoàn thành").reduce((a,e)=>a+(e.wl||0),0); const totalWl=es.filter(e=>e.status!=="Hủy").reduce((a,e)=>a+(e.wl||0),0); return {doneWl, totalWl, ratio: totalWl?doneWl/totalWl:0}; };
  const meRatio = simAs ? ratioOf(wkE) : null;
  let h = `<div class="head"><div><h1>Tải tuần</h1>${simAs?`<div class="sub">Đang xem riêng: ${esc(simAs)}</div>`:""}</div>${weekNav()}</div>`;
  const uAll = capE ? wlE/capE : null;
  h += `<div class="band">
    <div class="stat ${uAll>1?"bad":uAll>=.8?"warn":uAll!=null?"ok":""}"><div class="v">${pct(uAll)}</div><div class="l">Mức sử dụng (người đã nhập)</div></div>
    <div class="stat ${over?"bad":""}"><div class="v">${over}</div><div class="l">Người quá tải</div></div>
    <div class="stat ${rows.length-entered.length?"warn":""}"><div class="v">${rows.length-entered.length}</div><div class="l">Người chưa nhập tuần</div></div>
    <div class="stat"><div class="v">${fmt1(wlE)}</div><div class="l">Workload toàn phòng</div></div>
    <div class="stat ok"><div class="v">${done}${meRatio?` <span class="small muted">(${pct(meRatio.ratio)})</span>`:""}</div><div class="l">Đầu việc xong trong tuần</div></div>
    <div class="stat ${blocked.length?"bad":""}"><div class="v">${blocked.length}</div><div class="l">Đầu việc bị vướng</div></div></div>`;
  const maxScale = Math.max(1.5, ...rows.map(r=>r.u||0));
  const legend = `<div class="legend">${TYPES.map(t=>`<span>${typeDot(t)}${t}</span>`).join("")}<span><span class="tdot" style="background:transparent;border-left:2px dashed var(--ink-3)"></span>80%</span><span><span class="tdot" style="background:transparent;border-left:2px solid var(--bad)"></span>100%</span></div>`;
  h += `<section class="panel"><div class="panel-h"><h2>Workload từng người</h2>${legend}</div>`;
  h += rows.map(r => {
    const segs = TYPES.map(t => r.L.byType[t] ? `<span style="width:${(r.L.byType[t]/r.s.cap)/maxScale*100}%; background:${TYPE_COLOR[t]}" title="${t}: ${fmt1(r.L.byType[t])}"></span>` : "").join("");
    const mxh = Math.max(1.2, ...r.hist.map(x=>x||0));
    return `<div class="lrow"><div><div class="cell-main">${esc(r.s.name)}</div><div class="small muted">${r.L.es.length} đầu việc</div></div>
      <div class="lbar" title="${pct(r.u)}"><div class="fill" style="width:${Math.min(100,(r.u||0)/maxScale*100)}%">${segs}</div>
        <i class="tick" style="left:${.8/maxScale*100}%"></i><i class="tick t100" style="left:${1/maxScale*100}%"></i></div>
      <div class="upct" style="color:${r.u>1?"var(--bad)":r.u>=.8?"var(--warn)":"inherit"}">${r.L.es.length?pct(r.u):"–"}</div>
      <div class="small muted hide-m">${fmt1(r.L.wl)} / ${fmt1(r.s.cap)} điểm</div>
      <div class="spark hide-m" title="4 tuần gần nhất">${r.hist.map((x,i)=>`<span class="${i===3?"cur":""}" style="height:${x==null?2:Math.max(2,x/mxh*26)}px; background:${x>1?"var(--bad)":x>=.8?"var(--warn)":"var(--teal)"}" title="Tuần ${isoWeek(addDays(w,[-21,-14,-7,0][i]))}: ${pct(x)}"></span>`).join("")}</div>
      <div><span class="pill ${r.state[0]}">${r.state[1]}</span></div></div>`;
  }).join("") || `<div class="empty">Chưa có nhân sự. Thêm ở mục Cài đặt.</div>`;
  h += `</section>`;
  /* Xem riêng 1 người: thường chỉ 1-2 dự án nên gộp theo dự án không có nhiều thông tin, đổi sang gộp
     theo từng đầu việc. Xem "Tất cả": vẫn gộp theo dự án như cũ (nhiều người/nhiều dự án). */
  const TOP_N = 6;
  let arr, mx, label, empty, rowHtml, restLabel;
  if(simAs){
    const byT = new Map();
    for(const e of wkE){ if(e.wl==null) continue; const k=e.projectId+"|"+e.taskId; const o=byT.get(k)||{wl:0, type:e.type, status:e.status, name:e.ref?planShortName(e.ref.t.dv):"(đầu việc đã xoá)", proj:(M.pById.get(e.projectId)||{}).name||"(dự án đã xoá)"}; o.wl+=e.wl; byT.set(k,o); }
    arr = [...byT.values()].sort((a,b)=>b.wl-a.wl); mx = Math.max(1,...arr.map(o=>o.wl));
    label = "workload theo đầu việc"; empty = "Chưa có dữ liệu cho tuần này."; restLabel = "đầu việc khác";
    rowHtml = o=>`<div class="hbar"><span>${esc(o.name)} <span class="muted small">· ${esc(o.proj)}</span> ${o.status?stPill(o.status):""}</span><div class="t"><i style="width:${o.wl/mx*100}%; background:${TYPE_COLOR[o.type]}"></i></div><span style="text-align:right">${fmt1(o.wl)}</span></div>`;
  } else {
    const byP = new Map();
    for(const e of wkE){ if(e.wl==null) continue; const p=M.pById.get(e.projectId); const k=p?p.name:"(Đã xoá)"; const o=byP.get(k)||{wl:0,type:p?p.type:"Nội bộ",people:new Set(),name:k}; o.wl+=e.wl; o.people.add(e.person); byP.set(k,o); }
    arr = [...byP.values()].sort((a,b)=>b.wl-a.wl); mx = Math.max(1,...arr.map(o=>o.wl));
    label = "workload theo dự án"; empty = "Chưa có dữ liệu cho tuần này."; restLabel = "dự án khác";
    rowHtml = o=>`<div class="hbar"><span>${esc(o.name)} <span class="muted small">· ${o.people.size} người</span></span><div class="t"><i style="width:${o.wl/mx*100}%; background:${TYPE_COLOR[o.type]}"></i></div><span style="text-align:right">${fmt1(o.wl)}</span></div>`;
  }
  const shown = arr.slice(0, TOP_N), restN = arr.length - shown.length;
  let left = `<section class="panel"><div class="panel-h"><h2>Công sức tuần này dồn vào đâu</h2><span class="muted small">${label}</span></div><div class="panel-b">` +
    (arr.length ? shown.map(rowHtml).join("") + (restN>0?`<div class="small muted" style="margin-top:6px">+ ${restN} ${restLabel}</div>`:"")
     : `<div class="muted small">${empty}</div>`) + `</div></section>`;
  let right = `<section class="panel"><div class="panel-h"><h2>Đầu việc bị vướng trong tuần</h2></div><div class="panel-b">` +
    (blocked.length ? blocked.map(e=>`<div class="alert-item"><div class="small muted">${esc((M.pById.get(e.projectId)||{}).name||"")} · ${esc(e.person)}</div>
      <div class="cell-main">${esc(e.ref?e.ref.t.dv:"")}</div><div class="small" style="margin-top:4px">${e.ms!=null?`<span class="pill bad">Ma sát ${e.ms}</span> `:""}${e.nn?`<span class="pill mute">${esc(e.nn)}</span> `:""}<span class="muted">${esc(e.note||e.work||"")}</span></div></div>`).join("")
     : `<div class="muted small">Không có đầu việc nào bị vướng.</div>`) + `</div></section>`;
  /* Xem riêng 1 người: tỉ lệ hoàn thành đã hiện ngay trong ô "Đầu việc xong trong tuần" (meRatio ở trên),
     không cần bảng riêng nữa – chỉ còn 2 panel Công sức/Vướng như cũ.
     Xem "Tất cả": vẫn cần bảng danh sách tỉ lệ hoàn thành của từng người, tách thành 2 cột. */
  if(simAs) return h + `<div class="grid2" style="margin-top:18px"><div>${left}</div><div>${right}</div></div>`;
  const perPerson = staffList.map(s => ({name:s.name, ...ratioOf(M.entries.filter(e=>e.person===s.name && e.week===w))}));
  const donePanel = `<section class="panel"><div class="panel-h"><h2>Tỉ lệ hoàn thành công việc</h2><span class="muted small">workload Hoàn thành / tổng workload tuần, theo từng người</span></div>
    <div class="panel-b">` + (perPerson.length ? perPerson.map(r=>`<div class="hbar"><span>${esc(r.name)}</span><div class="t"><i style="width:${Math.round(r.ratio*100)}%; background:var(--ok)"></i></div><span style="text-align:right">${pct(r.ratio)}</span></div>`).join("")
      : `<div class="muted small">Chưa có nhân sự.</div>`) + `</div></section>`;
  return h + `<div class="grid2" style="margin-top:18px"><div>${donePanel}</div><div>${left}<div style="margin-top:18px">${right}</div></div></div>`;
}


VIEW_RENDER.load = viewLoad;
