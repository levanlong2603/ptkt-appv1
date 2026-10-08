"use strict";
/* Màn hình: weekly load */
/* ================= VIEW: weekly load ================= */
function loadFor(name, week){
  const es = M.entries.filter(e=>e.person===name && e.week===week);
  const byType = {}; let wl=0, missing=0;
  for(const e of es){ if(e.wl==null){ missing++; continue; } wl+=e.wl; byType[e.type]=(byType[e.type]||0)+e.wl; }
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
  let h = `<div class="head"><div><h1>Tải tuần</h1><div class="sub">Workload từng người trong tuần, so với capacity · nguồn: dữ liệu nhập theo tuần${simAs?` · đang xem riêng: ${esc(simAs)}`:""}</div></div>${weekNav()}</div>`;
  const uAll = capE ? wlE/capE : null;
  h += `<div class="band">
    <div class="stat ${uAll>1?"bad":uAll>=.8?"warn":uAll!=null?"ok":""}"><div class="v">${pct(uAll)}</div><div class="l">Mức sử dụng (người đã nhập)</div></div>
    <div class="stat ${over?"bad":""}"><div class="v">${over}</div><div class="l">Người quá tải</div></div>
    <div class="stat ${rows.length-entered.length?"warn":""}"><div class="v">${rows.length-entered.length}</div><div class="l">Người chưa nhập tuần</div></div>
    <div class="stat"><div class="v">${fmt1(wlE)}</div><div class="l">Workload toàn phòng</div></div>
    <div class="stat ok"><div class="v">${done}</div><div class="l">Đầu việc xong trong tuần</div></div>
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
  // by project
  const byP = new Map();
  for(const e of wkE){ if(e.wl==null) continue; const p=M.pById.get(e.projectId); const k=p?p.name:"(Đã xoá)"; const o=byP.get(k)||{wl:0,type:p?p.type:"Nội bộ",people:new Set()}; o.wl+=e.wl; o.people.add(e.person); byP.set(k,o); }
  const arr = [...byP.entries()].sort((a,b)=>b[1].wl-a[1].wl); const mx = Math.max(1,...arr.map(a=>a[1].wl));
  let left = `<section class="panel"><div class="panel-h"><h2>Công sức tuần này dồn vào đâu</h2><span class="muted small">workload theo dự án</span></div><div class="panel-b">` +
    (arr.length ? arr.map(([n,o])=>`<div class="hbar"><span>${esc(n)} <span class="muted small">· ${o.people.size} người</span></span><div class="t"><i style="width:${o.wl/mx*100}%; background:${TYPE_COLOR[o.type]}"></i></div><span style="text-align:right">${fmt1(o.wl)}</span></div>`).join("")
     : `<div class="muted small">Chưa có dữ liệu cho tuần này.</div>`) + `</div></section>`;
  let right = `<section class="panel"><div class="panel-h"><h2>Đầu việc bị vướng trong tuần</h2></div><div class="panel-b">` +
    (blocked.length ? blocked.map(e=>`<div class="alert-item"><div class="small muted">${esc((M.pById.get(e.projectId)||{}).name||"")} · ${esc(e.person)}</div>
      <div class="cell-main">${esc(e.ref?e.ref.t.dv:"")}</div><div class="small" style="margin-top:4px">${e.ms!=null?`<span class="pill bad">Ma sát ${e.ms}</span> `:""}${e.nn?`<span class="pill mute">${esc(e.nn)}</span> `:""}<span class="muted">${esc(e.note||e.work||"")}</span></div></div>`).join("")
     : `<div class="muted small">Không có đầu việc nào bị vướng.</div>`) + `</div></section>`;
  return h + `<div class="grid2" style="margin-top:18px"><div>${left}</div><div>${right}</div></div>`;
}


VIEW_RENDER.load = viewLoad;
