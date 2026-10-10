"use strict";
/* Màn hình: executive dashboard */
/* ================= VIEW: executive dashboard ================= */
const EXC = {red:"#E5484D", orange:"#F59E0B", yellow:"#EAB308", green:"#22A06B", blue:"#2F6FED", grey:"#94A3B8", purple:"#7C3AED", pink:"#EC4899", teal:"#0E9F9A", navy:"#0B2A5B"};
function periodInfo(anchor, kind){
  const d = parse(anchor);
  if(kind==="week") return {weeks:[anchor], label:`Tuần ${isoWeek(anchor)} · ${dm(anchor)} – ${dmy(addDays(anchor,6))}`, short:"tuần"};
  const y = d.getFullYear();
  let m0, m1, label;
  if(kind==="month"){ m0 = d.getMonth(); m1 = m0; label = `Tháng ${m0+1}/${y}`; }
  else { const qn = Math.floor(d.getMonth()/3); m0 = qn*3; m1 = m0+2; label = `Quý ${qn+1}/${y}`; }
  const weeks = []; let w = mondayOf(iso(new Date(y, m0, 1)));
  if(parse(w).getMonth()!==m0) w = addDays(w,7);
  while(true){ const wd = parse(w); if(wd.getFullYear()!==y || wd.getMonth()>m1) break; weeks.push(w); w = addDays(w,7); }
  return {weeks, label, short: kind==="month"?"tháng":"quý"};
}
function shiftAnchor(anchor, kind, dir){
  if(kind==="week") return addDays(anchor, 7*dir);
  const d = parse(anchor); const step = kind==="month"?1:3;
  const nd = new Date(d.getFullYear(), d.getMonth()+step*dir, 1);
  const w = mondayOf(iso(nd)); return parse(w).getMonth()===nd.getMonth() ? w : addDays(w,7);
}
function donut(segs, center, sub, size){
  size = size || 132; const r = size/2-14, c = 2*Math.PI*r, tot = segs.reduce((a,s)=>a+s.v,0);
  let off = 0; let arcs = "";
  if(!tot) arcs = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="22"/>`;
  else for(const s of segs){ if(!s.v) continue; const len = s.v/tot*c;
    arcs += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size/2} ${size/2})"><title>${esc(s.label)}: ${s.v}</title></circle>`; off += len; }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(center+" "+sub)}">${arcs}
    <text x="50%" y="${sub?"48%":"52%"}" text-anchor="middle" dominant-baseline="middle" font-size="${size>120?22:19}" font-weight="800" fill="var(--ink)">${esc(center)}</text>
    ${sub?`<text x="50%" y="64%" text-anchor="middle" font-size="12" fill="var(--ink-2)">${esc(sub)}</text>`:""}</svg>`;
}
const EXICON = {
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5" opacity=".5"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="#2F6FED"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c.8-4.3 4.2-7 8.5-7s7.7 2.7 8.5 7z"/></svg>',
  task:'<svg viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="#E5484D" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'
};
function viewExec(){
  const kind = S.period || "week";
  const P = periodInfo(S.week, kind);
  const nW = Math.max(1, P.weeks.length);
  const inP = new Set(P.weeks);
  /* Trưởng phòng chọn một người cụ thể ở "Tôi là" (không phải "Tất cả") → Dashboard chỉ tính theo
     dự án người đó là TM/SE (cho công việc/dự án/ma sát) và theo workload của riêng người đó (cho
     phần nguồn lực). Tài khoản nhân viên tự đăng nhập thì không bị thu hẹp, vẫn thấy cả phòng. */
  const simAs = (S.canEdit && S.me && S.me!=="__all__") ? S.me : null;
  const staffList = simAs ? M.staff.filter(s=>s.name===simAs) : M.staff;
  const E = M.entries.filter(e=>inP.has(e.week) && (!simAs || e.person===simAs));
  /* Đầu việc Hủy không tính vào workload, đồng bộ với loadFor() ở weekly-load.js */
  const sumWl = arr => arr.reduce((a,e)=>a+(e.status==="Hủy"?0:(e.wl||0)),0);
  const wl = sumWl(E);
  const capWeek = staffList.reduce((a,s)=>a+s.cap,0), cap = capWeek*nW;
  // people
  const people = staffList.map(s => {
    const es = E.filter(e=>e.person===s.name); const w = sumWl(es); const c = s.cap*nW; const u = c ? w/c : 0;
    const st = !es.length ? ["tg-gry","Chưa nhập"] : es.some(e=>e.wl==null) ? ["tg-gry","Thiếu quy mô"] : u>1 ? ["tg-red","Quá tải"] : u>=.8 ? ["tg-org","Tải cao"] : u>=.6 ? ["tg-grn","Bình thường"] : ["tg-grn","Còn khả năng"];
    return {s, w, c, u, st, n:es.length};
  }).sort((a,b)=>b.u-a.u);
  const over = people.filter(p=>p.n && p.u>1).length, high = people.filter(p=>p.n && p.u>=.8 && p.u<=1).length, low = people.filter(p=>p.n && p.u<.8).length, none = people.filter(p=>!p.n).length;
  const U = cap ? wl/cap : 0;
  // tasks
  // Danh sách theo đầu việc (Công việc, Ma sát, Lịch hết hạn…) siết tới đúng đầu việc người đó phụ trách/phối hợp,
  // không phải mọi đầu việc của dự án họ là TM/SE – danh sách "Dự án" (runP bên dưới) vẫn giữ theo TM/SE của cả dự án.
  const seenKey = new Set();
  const T = M.tasks.filter(t=>t.p.type!=="Nội bộ" && (!simAs || (projectAssigned(t.p, simAs) && (t.owner===simAs || t.collab===simAs)))
    && !seenKey.has(t.key) && seenKey.add(t.key)); // chặn trùng dòng nếu cùng một đầu việc (dự án+id) lọt vào nhiều lần
  const active = T.filter(t=>t.status==="Đang làm"||t.status==="Đang vướng");
  const isLate = t => t.warns.some(w=>w[1]==="Quá hạn"), isSoon = t => t.warns.some(w=>w[1]==="Sắp đến hạn");
  /* "Công việc đang thực hiện": tính cả Tạm dừng (không chỉ Đang làm/Đang vướng như "active") vì đây là
     KPI tổng quan "đã khởi động, chưa xong", khác với "active" dùng để lọc bảng/ma sát bên dưới. */
  const doingN = T.filter(t=>t.status==="Đang làm").length, stuckN = T.filter(t=>t.status==="Đang vướng").length, pausedN = T.filter(t=>t.status==="Tạm dừng").length;
  const inProgressN = doingN+stuckN+pausedN;
  /* "Công việc quá hạn": tính trên mọi đầu việc còn mở (không chỉ active), chia theo số ngày đã trễ. */
  const lateAll = T.filter(isLate);
  const lateB1 = lateAll.filter(t=>days(t.deadline,M.today)<=1).length;
  const lateB2 = lateAll.filter(t=>{const d=days(t.deadline,M.today); return d>1 && d<=3;}).length;
  const lateB3 = lateAll.length - lateB1 - lateB2;
  // projects & risk
  const allProj = M.projects.filter(p=>p.type!=="Nội bộ" && (p.tasks||[]).length && (!simAs || projectAssigned(p, simAs)));
  const runP = allProj.filter(p=>!p._allDone); // đồng bộ với planIsDone(): dựa trạng thái từng đầu việc, không dùng p._prog===1
  const doneP = allProj.length - runP.length;
  const risk = p => (p._late>0 || p._maxms>=4) ? ["tg-red","Cao",3] : (p._soon>0 || p._stuck>0 || p._maxms>=2) ? ["tg-org","Trung bình",2] : ["tg-grn","Thấp",1];
  // friction – chỉ tính từ đầu việc đang thực sự có người làm (Đang làm/Đang vướng), không tính
  // "Chưa bắt đầu"/"Tạm dừng" dù trước đó từng được chấm ma sát (việc chưa làm hoặc đang tạm dừng
  // thì không còn đang "vướng" theo nghĩa cần can thiệp ngay).
  const fr = active.filter(t=>(t.ms||0)>=1).sort((a,b)=>(b.ms||0)-(a.ms||0) || String(a.deadline||"9").localeCompare(String(b.deadline||"9")));

  let h = `<div class="ex">
  <div class="head"><div><h1>Dashboard</h1><div class="sub">Tình hình vận hành phòng kỹ thuật${simAs?` · đang xem riêng: ${esc(simAs)}`:""}</div></div>
    <div class="ex-ctl"><div class="ex-wk"><button data-act="exnav" data-d="-1" aria-label="Kỳ trước">‹</button><div class="lb">${esc(P.label)}</div><button data-act="exnav" data-d="1" aria-label="Kỳ sau">›</button></div>
      <div class="ex-seg" role="group" aria-label="Kỳ báo cáo">${[["week","Tuần"],["month","Tháng"],["quarter","Quý"]].map(([k,l])=>`<button data-act="exper" data-k="${k}" aria-pressed="${kind===k}">${l}</button>`).join("")}</div>
      <button class="btn icon" data-act="exrefresh" title="Làm mới" aria-label="Làm mới">${EXICON.refresh}</button>
      <div class="ex-seg"><button data-act="present" aria-pressed="false">${document.body.classList.contains("present")?"Thoát trình chiếu":"Trình chiếu"}</button></div></div></div>`;
  // KPI row
  h += `<div class="ex-kpis">
    <div class="ex-card"><h4>Công việc đang thực hiện</h4><div class="ex-k"><div class="ex-ico" style="background:#E8F0FE">${EXICON.task}</div><div><div><span class="ex-big">${inProgressN}</span></div>
      <ul class="ex-list" style="margin-top:4px"><li><i style="background:${EXC.green}"></i>${doingN} Đang làm</li><li><i style="background:${EXC.red}"></i>${stuckN} Đang vướng</li><li><i style="background:${EXC.orange}"></i>${pausedN} Tạm dừng</li></ul></div></div></div>
    <div class="ex-card"><h4>Công việc quá hạn</h4><div class="ex-k"><div class="ex-ico" style="background:#FDE8E8">${EXICON.warn}</div><div><div><span class="ex-big">${lateAll.length}</span></div>
      <ul class="ex-list" style="margin-top:4px"><li><i style="background:${EXC.yellow}"></i>${lateB1} quá hạn ≤ 1 ngày</li><li><i style="background:${EXC.orange}"></i>${lateB2} quá hạn 2–3 ngày</li><li><i style="background:${EXC.red}"></i>${lateB3} quá hạn &gt; 3 ngày</li></ul></div></div></div>
    <div class="ex-card"><h4>Dự án đang triển khai</h4><div class="ex-k"><div class="ex-ico" style="background:#E8F0FE">${EXICON.box}</div><div><div><span class="ex-big">${runP.length}</span></div>
      <ul class="ex-list" style="margin-top:4px"><li><i style="background:${EXC.blue}"></i>${runP.length} Đang triển khai</li><li><i style="background:${EXC.green}"></i>${doneP} Hoàn thành</li></ul></div></div></div>
    <div class="ex-card"><h4>Mức sử dụng phòng</h4><div class="ex-donut">${donut([{v:Math.min(U,1),color:U>1?EXC.red:U>=.8?EXC.orange:EXC.green,label:"Đã dùng"},{v:Math.max(0,1-U),color:"var(--line-2)",label:"Còn trống"}], pct(U), "", 104)}
      <ul class="ex-list"><li><i style="background:${EXC.red}"></i>&gt; 100%: ${over} người</li><li><i style="background:${EXC.orange}"></i>80 – 100%: ${high} người</li><li><i style="background:${EXC.green}"></i>&lt; 80%: ${low} người</li>${none?`<li><i style="background:${EXC.grey}"></i>Chưa nhập: ${none} người</li>`:""}</ul></div></div>
  </div>`;
  const utilColor = u => u>1?EXC.red:u>=.8?EXC.orange:EXC.teal;
  const exRelDay = deadline => { const d = days(M.today, deadline); return d<=0?"Trong ngày":d===1?"Ngày mai":`${d} ngày nữa`; };
  // Row B: CẦN ƯU TIÊN XỬ LÝ (ma sát cao, trễ P1, quá tải, dự án rủi ro cao chưa có ở trên) + LỊCH HẠN SẮP TỚI
  const soonList = T.filter(t=>OPEN.has(t.status) && t.deadline && t.deadline>=M.today && days(M.today,t.deadline)<=14).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  const act = []; const actPid = new Set();
  for(const t of fr.filter(t=>t.ms>=3)){ const a = {"Hãng":"Liên hệ hãng","Khách hàng":"Trao đổi khách hàng","Hàng hóa / thiết bị":"Đôn đốc hàng hóa","Chờ quyết định":"Ra quyết định","Cộng sự":"Điều phối nội bộ","Hệ thống":"Xử lý hệ thống","Thay đổi yêu cầu":"Chốt yêu cầu"}[t.nn]||"Xem đầu việc";
    act.push({level:["tg-red","Cao"], title:t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""), desc:`Ma sát ${t.ms}${t.nn?" · "+esc(t.nn):""}`, person:t.owner||"–", project:t.p.name, btn:a, go:"task:"+t.p.id+"|"+t.id});
    actPid.add(t.p.id); }
  for(const t of T.filter(t=>isLate(t) && t.pr==="P1" && !(t.ms>=3))){
    act.push({level:["tg-red","Cao"], title:t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""), desc:`Quá hạn ${dm(t.deadline)} · Ưu tiên P1`, person:t.owner||"–", project:t.p.name, btn:"Xem lại kế hoạch", go:"task:"+t.p.id+"|"+t.id});
    actPid.add(t.p.id); }
  for(const p of people.filter(p=>p.n && p.u>1)) act.push({level:["tg-org","Trung bình"], title:`Quá tải ${pct(p.u)}`, desc:`Capacity ${fmt1(p.c)} điểm · Workload ${fmt1(p.w)} điểm`, person:p.s.name, project:"–", btn:"Điều phối công việc", go:"load:"+encodeURIComponent(p.s.name)});
  for(const p of runP.filter(p=>risk(p)[2]===3 && !actPid.has(p.id))){ const note = p._late?`${p._late} đầu việc quá hạn`:p._stuck?`${p._stuck} đầu việc đang vướng`:"Rủi ro cao, cần theo dõi sát";
    act.push({level:["tg-org","Trung bình"], title:"Dự án rủi ro cao", desc:note, person:p.owner||"–", project:p.name, btn:"Xem dự án", go:"p:"+p.id}); }
  h += `<div class="ex-row ex-r4">
    <div class="ex-card ex-act"><div class="ex-h"><h3>CẦN ƯU TIÊN XỬ LÝ</h3><span class="muted small">${act.length} việc</span></div>
      <div class="ex-scroll" style="max-height:340px">${act.map((a,i)=>`<div class="ex-ai ex-ai2"><div class="ex-ai-n">${i+1}</div><div class="ex-ai-b"><div class="ex-ai-top"><span class="ex-tag ${a.level[0]}">${a.level[1]}</span><b>${esc(a.title)}</b></div><div class="muted small">${a.desc}</div><div class="ex-ai-meta"><span>Người phụ trách: <b>${esc(a.person)}</b></span><span>Dự án: <b>${esc(a.project)}</b></span></div></div><button class="lnk" data-act="exgo" data-go="${esc(a.go)}">Xem chi tiết ›</button></div>`).join("")||`<div class="ex-empty">Không có việc cần can thiệp ngay.</div>`}</div></div>
    <div class="ex-card"><div class="ex-h"><h3>LỊCH HẠN SẮP TỚI</h3><span class="muted small">${soonList.length} việc</span></div>
      <div class="ex-scroll" style="max-height:340px">${soonList.map(t=>{ const d=new Date(t.deadline+"T00:00:00"); const dd=String(d.getDate()).padStart(2,"0");
        return `<div class="ex-dl"><div class="ex-dl-d"><div class="n">${dd}</div><div class="m">Th${d.getMonth()+1}</div></div><div class="ex-dl-b"><div class="w">${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))}</div><div class="muted small">${esc(t.p.name)} · ${esc(t.owner||"–")}</div></div><div class="ex-dl-r" style="color:${days(M.today,t.deadline)<=3?EXC.red:"inherit"}">${exRelDay(t.deadline)}</div></div>`; }).join("")||`<div class="ex-empty">Không có đầu việc nào đến hạn trong 14 ngày tới.</div>`}</div></div></div>`;
  // Row C: PHÂN BỔ WORKLOAD NHÂN SỰ (top 5 theo mức sử dụng) + TIẾN ĐỘ DỰ ÁN TRỌNG ĐIỂM
  const topPeople = [...people].sort((a,b)=>b.u-a.u).slice(0,5);
  const keyP = [...runP].sort((a,b)=>risk(b)[2]-risk(a)[2] || (a._prog||0)-(b._prog||0));
  h += `<div class="ex-row ex-r3">
    <div class="ex-card"><div class="ex-h"><h3>PHÂN BỔ WORKLOAD NHÂN SỰ</h3><button class="lnk" data-act="golo">Xem chi tiết ›</button></div>
      ${topPeople.length?topPeople.map(p=>`<div class="ex-pr"><div class="ex-pr-top"><span>${esc(p.s.name)}${p.s.title?`<span class="muted" style="font-weight:400"> · ${esc(p.s.title)}</span>`:""}</span><span class="ex-tag ${p.st[0]}">${p.st[1]}</span></div><div class="ex-ubar"><div class="t"><i style="width:${Math.min(100,p.u*100)}%; background:${utilColor(p.u)}"></i></div><b style="color:${p.u>1?EXC.red:"inherit"}">${p.n?pct(p.u):"–"}</b></div></div>`).join(""):`<div class="ex-empty">Chưa có dữ liệu nhập ${P.short} này.</div>`}</div>
    <div class="ex-card"><div class="ex-h"><h3>TIẾN ĐỘ DỰ ÁN TRỌNG ĐIỂM</h3><button class="lnk" data-act="godash">Xem tất cả ›</button></div>
      <div class="ex-scroll" style="max-height:260px"><table class="ex-t"><thead><tr><th>Dự án</th><th>Tiến độ</th><th class="c">Mốc tiếp theo</th><th class="c">Nguy cơ trễ</th><th>Ghi chú</th></tr></thead><tbody>
      ${keyP.map(p=>{ const r=risk(p); const note = p._late?`${p._late} đầu việc quá hạn`:p._stuck?`${p._stuck} đầu việc đang vướng`:p._soon?`${p._soon} đầu việc sắp đến hạn`:"Đúng kế hoạch";
        return `<tr><td class="w"><b>${esc(p.name)}</b><div class="muted" style="font-size:11.5px">${esc(p.type)} · ${esc(p.owner||"–")}</div></td>
        <td><div class="ex-ubar"><div class="t"><i style="width:${Math.round((p._prog||0)*100)}%; background:${EXC.blue}"></i></div><b>${pct(p._prog)}</b></div></td>
        <td class="c">${p._next?dmy(p._next):"–"}</td><td class="c"><span class="ex-tag ${r[0]}">${r[1]}</span></td><td class="w" style="min-width:110px">${note}</td></tr>`; }).join("")||`<tr><td colspan="5" class="ex-empty">Không có dự án đang chạy.</td></tr>`}</tbody></table></div></div></div>`;
  // Row D: CÔNG VIỆC ĐANG THỰC HIỆN – bảng đầy đủ, có tìm kiếm + cột Rủi ro
  const pr = S.exPr || "Tất cả";
  const prRank = {P1:1,P2:2,P3:3,P4:4};
  const q = (S.exQ||"").trim().toLowerCase();
  const taskRisk = t => isLate(t) || (t.ms||0)>=3 ? ["tg-red","Cao"] : (isSoon(t) || (t.ms||0)>=1) ? ["tg-org","Trung bình"] : ["tg-grn","Thấp"];
  const list = T.filter(t=>(t.status==="Đang làm"||t.status==="Đang vướng") && (pr==="Tất cả" || t.pr===pr)
      && (!q || t.dv.toLowerCase().includes(q) || t.p.name.toLowerCase().includes(q) || (t.owner||"").toLowerCase().includes(q)))
    .sort((a,b)=>(b.ms||0)-(a.ms||0) || (prRank[a.pr]||9)-(prRank[b.pr]||9) || String(a.deadline||"9999").localeCompare(String(b.deadline||"9999")));
  h += `<div class="ex-row ex-r2" style="grid-template-columns:1fr">
    <div class="ex-card"><div class="ex-h"><h3>CÔNG VIỆC ĐANG THỰC HIỆN</h3>
      <div class="ex-chips" role="group" aria-label="Lọc ưu tiên">${["Tất cả","P1","P2","P3","P4"].map(x=>`<button data-act="expr" data-p="${x}" aria-pressed="${pr===x}">${x}</button>`).join("")}</div></div>
      <div class="panel-b" style="padding:0 16px 12px"><input type="search" data-act="exq" value="${esc(S.exQ||"")}" placeholder="Tìm công việc, dự án, người phụ trách…" style="width:100%; max-width:360px"></div>
      <div class="ex-scroll"><table class="ex-t"><thead><tr><th class="c">#</th><th>Công việc</th><th>Dự án</th><th>Phụ trách</th><th class="c">Quy<br>mô</th><th class="c">Độ phức<br>tạp</th><th class="c">Work-<br>load</th><th class="c">Ưu<br>tiên</th><th class="c">Hạn</th><th class="c">Ma sát</th><th class="c">Rủi ro</th><th class="c">Trạng thái</th></tr></thead><tbody>
      ${list.map((t,i)=>{ const r=taskRisk(t); return `<tr><td class="c">${i+1}</td><td class="w">${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))}</td><td class="w2">${esc(t.p.name)}</td><td class="w2">${esc(t.owner||"–")}</td>
        <td class="c">${t.qmE??"–"}</td><td class="c">${t.ptE??"–"}</td><td class="c"><b>${t.wl??"–"}</b></td><td class="c">${t.pr?`<span class="ex-tag tg-${t.pr.toLowerCase()}">${esc(t.pr)}</span>`:"–"}</td>
        <td class="c" style="color:${isLate(t)?EXC.red:"inherit"}; font-weight:${isLate(t)?700:400}">${t.deadline?dm(t.deadline):"–"}</td>
        <td class="c">${(t.ms||0)>=1?`<span class="ex-tag ${t.ms>=3?"tg-red":"tg-org"}">${esc(t.nn||"Ma sát")} (${t.ms})</span>`:"–"}</td>
        <td class="c"><span class="ex-tag ${r[0]}">${r[1]}</span></td>
        <td class="c"><span class="ex-tag ${{"Đang làm":"tg-grn","Đang vướng":"tg-red","Tạm dừng":"tg-org"}[t.status]||"tg-gry"}">${t.status==="Tạm dừng"?"Đang chờ":esc(t.status)}</span></td></tr>`; }).join("") || `<tr><td colspan="12" class="ex-empty">Không có công việc phù hợp.</td></tr>`}
      </tbody></table></div><div class="ex-legend">Ma sát: 0 không vướng · 1 vướng nhẹ · 2 vướng vừa · 3 vướng nhiều · 4 phụ thuộc nghiêm trọng · 5 bị đình trệ</div></div></div>`;
  h += `<div class="small muted">Workload, capacity, mức sử dụng và phân bổ workload tính theo ${P.short} đã chọn (dữ liệu nhập theo tuần). Công việc, dự án, ma sát, hạn chót tính theo tình trạng hiện tại (${dmy(M.today)}).</div></div>`;
  return h;
}


VIEW_RENDER.exec = viewExec;
