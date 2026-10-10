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
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="#E5484D" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
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
  const aLate = active.filter(isLate).length, aSoon = active.filter(t=>!isLate(t)&&isSoon(t)).length, aOk = active.length-aLate-aSoon;
  // projects & risk
  const runP = M.projects.filter(p=>p.type!=="Nội bộ" && (p.tasks||[]).length && (p._prog==null || p._prog<1) && (!simAs || projectAssigned(p, simAs)));
  const risk = p => (p._late>0 || p._maxms>=4) ? ["tg-red","Cao",3] : (p._soon>0 || p._stuck>0 || p._maxms>=2) ? ["tg-org","Trung bình",2] : ["tg-grn","Thấp",1];
  const rHigh = runP.filter(p=>risk(p)[2]===3).length, rMid = runP.filter(p=>risk(p)[2]===2).length, rLow = runP.length-rHigh-rMid;
  // friction – chỉ tính từ đầu việc đang thực sự có người làm (Đang làm/Đang vướng), không tính
  // "Chưa bắt đầu"/"Tạm dừng" dù trước đó từng được chấm ma sát (việc chưa làm hoặc đang tạm dừng
  // thì không còn đang "vướng" theo nghĩa cần can thiệp ngay).
  const fr = active.filter(t=>(t.ms||0)>=1).sort((a,b)=>(b.ms||0)-(a.ms||0) || String(a.deadline||"9").localeCompare(String(b.deadline||"9")));
  const byCause = {}; fr.forEach(t=>{ const k=t.nn||"Chưa rõ nguyên nhân"; byCause[k]=(byCause[k]||0)+1; });
  const causeTop = Object.entries(byCause).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const causeCol = [EXC.orange, EXC.yellow, EXC.red];

  let h = `<div class="ex">
  <div class="ex-top"><div class="ex-logo">NGSI</div><div class="ex-title"><b>PHÒNG KỸ THUẬT</b><span>Quản trị công việc và nguồn lực${simAs?` · đang xem riêng: ${esc(simAs)}`:""}</span></div>
    <div class="ex-ctl"><div class="ex-wk"><button data-act="exnav" data-d="-1" aria-label="Kỳ trước">‹</button><div class="lb">${esc(P.label)}</div><button data-act="exnav" data-d="1" aria-label="Kỳ sau">›</button></div>
      <div class="ex-seg" role="group" aria-label="Kỳ báo cáo">${[["week","Tuần"],["month","Tháng"],["quarter","Quý"]].map(([k,l])=>`<button data-act="exper" data-k="${k}" aria-pressed="${kind===k}">${l}</button>`).join("")}</div>
      <div class="ex-seg"><button data-act="present" aria-pressed="false">${document.body.classList.contains("present")?"Thoát trình chiếu":"Trình chiếu"}</button></div></div></div>`;
  // KPI row
  h += `<div class="ex-kpis">
    <div class="ex-card"><h4>Mức sử dụng phòng</h4><div class="ex-donut">${donut([{v:Math.min(U,1),color:U>1?EXC.red:U>=.8?EXC.orange:EXC.green,label:"Đã dùng"},{v:Math.max(0,1-U),color:"var(--line-2)",label:"Còn trống"}], pct(U), "", 104)}
      <ul class="ex-list"><li><i style="background:${EXC.red}"></i>&gt; 100%: ${over} người</li><li><i style="background:${EXC.orange}"></i>80 – 100%: ${high} người</li><li><i style="background:${EXC.green}"></i>&lt; 80%: ${low} người</li>${none?`<li><i style="background:${EXC.grey}"></i>Chưa nhập: ${none} người</li>`:""}</ul></div></div>
    <div class="ex-card"><h4>Công việc</h4><div class="ex-k"><div class="ex-ico" style="background:#E8F0FE">${EXICON.task}</div><div><div><span class="ex-big">${active.length}</span> <span class="ex-unit">đang thực hiện</span></div>
      <ul class="ex-list" style="margin-top:4px"><li><i style="background:${EXC.red}"></i>${aLate} quá hạn</li><li><i style="background:${EXC.orange}"></i>${aSoon} có nguy cơ trễ</li><li><i style="background:${EXC.green}"></i>${aOk} đúng tiến độ</li></ul></div></div></div>
    <div class="ex-card"><h4>Dự án</h4><div class="ex-k"><div class="ex-ico" style="background:#E8F0FE">${EXICON.box}</div><div><div><span class="ex-big">${runP.length}</span> <span class="ex-unit">đang triển khai</span></div>
      <ul class="ex-list" style="margin-top:4px"><li><i style="background:${EXC.red}"></i>${rHigh} rủi ro cao</li><li><i style="background:${EXC.orange}"></i>${rMid} rủi ro trung bình</li><li><i style="background:${EXC.green}"></i>${rLow} bình thường</li></ul></div></div></div>
    <div class="ex-card"><h4>Ma sát đang theo dõi</h4><div class="ex-k"><div class="ex-ico" style="background:#FDE8E8">${EXICON.warn}</div><div><div><span class="ex-big">${fr.length}</span> <span class="ex-unit">việc</span></div>
      <ul class="ex-list" style="margin-top:4px">${causeTop.map(([c,n],i)=>`<li><i style="background:${causeCol[i]}"></i>${n} ${esc(c.toLowerCase())}</li>`).join("")||"<li>Không có</li>"}</ul></div></div></div>
  </div>`;
  // Row 2: people + task list
  const pr = S.exPr || "Tất cả";
  const prRank = {P1:1,P2:2,P3:3,P4:4};
  const list = T.filter(t=>(t.status==="Đang làm"||t.status==="Đang vướng") && (pr==="Tất cả" || t.pr===pr))
    .sort((a,b)=>(b.ms||0)-(a.ms||0) || (prRank[a.pr]||9)-(prRank[b.pr]||9) || String(a.deadline||"9999").localeCompare(String(b.deadline||"9999")));
  const utilColor = u => u>1?EXC.red:u>=.8?EXC.orange:EXC.teal;
  h += `<div class="ex-row ex-r2">
    <div class="ex-card"><div class="ex-h"><h3>TÌNH TRẠNG NGUỒN LỰC NHÂN VIÊN <span class="muted" style="font-weight:500">(${people.length} người)</span></h3><button class="lnk" data-act="golo">Xem chi tiết ›</button></div>
      <div class="ex-scroll"><table class="ex-t"><thead><tr><th class="c">#</th><th>Nhân viên</th><th class="c">Capacity<br>(điểm)</th><th class="c">Workload<br>(điểm)</th><th>Mức sử dụng</th><th class="c">Trạng thái</th></tr></thead><tbody>
      ${people.map((p,i)=>`<tr><td class="c">${i+1}</td><td>${esc(p.s.name)}</td><td class="c">${fmt1(p.c)}</td><td class="c">${fmt1(p.w)}</td>
        <td><div class="ex-ubar"><div class="t"><i style="width:${Math.min(100,p.u*100)}%; background:${utilColor(p.u)}"></i></div><b style="color:${p.u>1?EXC.red:"inherit"}">${p.n?pct(p.u):"–"}</b></div></td>
        <td class="c"><span class="ex-tag ${p.st[0]}">${p.st[1]}</span></td></tr>`).join("")}</tbody></table></div></div>
    <div class="ex-card"><div class="ex-h"><h3>DANH SÁCH CÔNG VIỆC ĐANG THỰC HIỆN</h3>
      <div class="ex-chips" role="group" aria-label="Lọc ưu tiên">${["Tất cả","P1","P2","P3","P4"].map(x=>`<button data-act="expr" data-p="${x}" aria-pressed="${pr===x}">${x}</button>`).join("")}</div></div>
      <div class="ex-scroll"><table class="ex-t"><thead><tr><th class="c">#</th><th>Công việc</th><th>Dự án</th><th>Phụ trách</th><th class="c">Quy<br>mô</th><th class="c">Độ phức<br>tạp</th><th class="c">Work-<br>load</th><th class="c">Ưu<br>tiên</th><th class="c">Hạn</th><th class="c">Ma sát</th><th class="c">Trạng thái</th></tr></thead><tbody>
      ${list.map((t,i)=>`<tr><td class="c">${i+1}</td><td class="w">${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))}</td><td class="w2">${esc(t.p.name)}</td><td class="w2">${esc(t.owner||"–")}</td>
        <td class="c">${t.qmE??"–"}</td><td class="c">${t.ptE??"–"}</td><td class="c"><b>${t.wl??"–"}</b></td><td class="c">${t.pr?`<span class="ex-tag tg-${t.pr.toLowerCase()}">${esc(t.pr)}</span>`:"–"}</td>
        <td class="c" style="color:${isLate(t)?EXC.red:"inherit"}; font-weight:${isLate(t)?700:400}">${t.deadline?dm(t.deadline):"–"}</td>
        <td class="c">${(t.ms||0)>=1?`<span class="ex-tag ${t.ms>=3?"tg-red":"tg-org"}">${esc(t.nn||"Ma sát")} (${t.ms})</span>`:"–"}</td>
        <td class="c"><span class="ex-tag ${{"Đang làm":"tg-grn","Đang vướng":"tg-red","Tạm dừng":"tg-org"}[t.status]||"tg-gry"}">${t.status==="Tạm dừng"?"Đang chờ":esc(t.status)}</span></td></tr>`).join("") || `<tr><td colspan="11" class="ex-empty">Không có công việc phù hợp.</td></tr>`}
      </tbody></table></div><div class="ex-legend">Ma sát: 0 không vướng · 1 vướng nhẹ · 2 vướng vừa · 3 vướng nhiều · 4 phụ thuộc nghiêm trọng · 5 bị đình trệ</div></div></div>`;
  // Row 3 – "Ma sát đang theo dõi" đã bỏ (trùng với cột Ma sát ở bảng công việc Row 2), thay bằng
  // "Tiến độ dự án trọng điểm" (trước ở Row 4) để đỡ trùng lặp thông tin.
  const byP = new Map(); for(const e of E){ if(!e.wl) continue; const p=M.pById.get(e.projectId); const k=p?p.name:"Khác"; byP.set(k,(byP.get(k)||0)+e.wl); }
  let parr = [...byP.entries()].sort((a,b)=>b[1]-a[1]); if(parr.length>7){ const rest=parr.slice(6).reduce((a,x)=>a+x[1],0); parr=[...parr.slice(0,6),["Khác",rest]]; }
  const barCols = [EXC.red, EXC.orange, EXC.blue, EXC.teal, EXC.purple, EXC.pink, EXC.grey];
  const mx = Math.max(1,...parr.map(x=>x[1]));
  const keyP = [...runP].sort((a,b)=>risk(b)[2]-risk(a)[2] || (a._prog||0)-(b._prog||0));
  h += `<div class="ex-row ex-r3">
    <div class="ex-card"><div class="ex-h"><h3>PHÂN BỔ WORKLOAD THEO DỰ ÁN</h3></div>
      ${parr.length?parr.map(([n,v],i)=>`<div class="ex-hb"><span title="${esc(n)}">${esc(n)}</span><div class="t"><i style="width:${v/mx*100}%; background:${barCols[i%barCols.length]}"></i></div><b>${fmt1(v)} <span class="muted" style="font-weight:400">(${wl?Math.round(v/wl*100):0}%)</span></b></div>`).join(""):`<div class="ex-empty">Chưa có dữ liệu nhập ${P.short} này.</div>`}</div>
    <div class="ex-card"><div class="ex-h"><h3>TIẾN ĐỘ DỰ ÁN TRỌNG ĐIỂM</h3><button class="lnk" data-act="godash">Xem tất cả ›</button></div>
      <div class="ex-scroll" style="max-height:260px"><table class="ex-t"><thead><tr><th>Dự án</th><th>Tiến độ</th><th class="c">Mốc tiếp theo</th><th class="c">Nguy cơ trễ</th><th>Ghi chú</th></tr></thead><tbody>
      ${keyP.map(p=>{ const r=risk(p); const note = p._late?`${p._late} đầu việc quá hạn`:p._stuck?`${p._stuck} đầu việc đang vướng`:p._soon?`${p._soon} đầu việc sắp đến hạn`:"Đúng kế hoạch";
        return `<tr><td class="w"><b>${esc(p.name)}</b><div class="muted" style="font-size:11.5px">${esc(p.type)} · ${esc(p.owner||"–")}</div></td>
        <td><div class="ex-ubar"><div class="t"><i style="width:${Math.round((p._prog||0)*100)}%; background:${EXC.blue}"></i></div><b>${pct(p._prog)}</b></div></td>
        <td class="c">${p._next?dmy(p._next):"–"}</td><td class="c"><span class="ex-tag ${r[0]}">${r[1]}</span></td><td class="w" style="min-width:110px">${note}</td></tr>`; }).join("")||`<tr><td colspan="5" class="ex-empty">Không có dự án đang chạy.</td></tr>`}</tbody></table></div></div></div>`;
  // Row 4
  const soonList = T.filter(t=>OPEN.has(t.status) && t.deadline && t.deadline>=M.today && days(M.today,t.deadline)<=14).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  const act = [];
  for(const t of fr.filter(t=>t.ms>=3)){ const a = {"Hãng":"Liên hệ hãng","Khách hàng":"Trao đổi khách hàng","Hàng hóa / thiết bị":"Đôn đốc hàng hóa","Chờ quyết định":"Ra quyết định","Cộng sự":"Điều phối nội bộ","Hệ thống":"Xử lý hệ thống","Thay đổi yêu cầu":"Chốt yêu cầu"}[t.nn]||"Xem đầu việc";
    act.push({txt:`<b>${esc(t.p.name)}</b> – ${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))}${t.nn?" – "+esc(t.nn):""} (ma sát ${t.ms})`, btn:a, go:"task:"+t.p.id+"|"+t.id}); }
  for(const t of T.filter(t=>isLate(t) && t.pr==="P1" && !(t.ms>=3))) act.push({txt:`<b>${esc(t.p.name)}</b> – ${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))} – quá hạn ${dm(t.deadline)}`, btn:"Xem lại kế hoạch", go:"task:"+t.p.id+"|"+t.id});
  for(const p of people.filter(p=>p.n && p.u>1)) act.push({txt:`<b>${esc(p.s.name)}</b> – <span style="color:${EXC.red}; font-weight:700">Quá tải ${pct(p.u)}</span>`, btn:"Điều phối công việc", go:"load:"+encodeURIComponent(p.s.name)});
  h += `<div class="ex-row ex-r4">
    <div class="ex-card"><div class="ex-h"><h3>LỊCH HẾT HẠN TRONG 2 TUẦN</h3><span class="muted small">${soonList.length} việc</span></div>
      <div class="ex-scroll" style="max-height:260px"><table class="ex-t"><tbody>
      ${soonList.map(t=>`<tr><td style="color:${days(M.today,t.deadline)<=3?EXC.red:"inherit"}; font-weight:600; white-space:nowrap">${dm(t.deadline)}</td><td class="w">${esc(t.dv.replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/,""))}<div class="muted" style="font-size:11.5px">${esc(t.p.name)}</div></td>
        <td class="c">${t.pr?`<span class="ex-tag tg-${t.pr.toLowerCase()}">${esc(t.pr)}</span>`:""}</td><td>${esc(t.owner||"–")}</td></tr>`).join("")||`<tr><td class="ex-empty">Không có đầu việc nào đến hạn trong 14 ngày tới.</td></tr>`}</tbody></table></div></div>
    <div class="ex-card ex-act"><div class="ex-h"><h3>⚠ VIỆC CẦN TRP CAN THIỆP NGAY</h3><span class="muted small">${act.length} việc</span></div>
      <div class="ex-scroll" style="max-height:260px">${act.map(a=>`<div class="ex-ai"><div>${a.txt}</div><button data-act="exgo" data-go="${esc(a.go)}">${esc(a.btn)}</button></div>`).join("")||`<div class="ex-empty">Không có việc cần can thiệp ngay.</div>`}</div></div></div>`;
  h += `<div class="small muted">Workload, capacity, mức sử dụng và phân bổ workload tính theo ${P.short} đã chọn (dữ liệu nhập theo tuần). Công việc, dự án, ma sát, hạn chót tính theo tình trạng hiện tại (${dmy(M.today)}).</div></div>`;
  return h;
}


VIEW_RENDER.exec = viewExec;
