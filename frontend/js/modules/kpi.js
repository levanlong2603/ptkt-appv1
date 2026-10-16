"use strict";
/* Module mở rộng: KPI & Năng lực.
   Đang hoàn thiện theo từng bước – hiện MỌI tài khoản xem được; admin + trưởng phòng mới đánh giá (lưu/chốt/mở lại)
   và cấu hình tiêu chí được (khớp KPI_ROLES ở backend/server.js; khi đổi phạm vi phải sửa cả 2 nơi).
     Bước 1 (file này): KPI tổng quan – kỳ đánh giá, thẻ số liệu, xu hướng, bảng nhân sự, trạng thái đánh giá.
     Bước 2: hồ sơ KPI cá nhân theo tab (hiện kpiDetailView() còn bố cục cũ, chưa có lưu/chốt bản đánh giá).
     Bước 3–4: ma trận năng lực, hồ sơ năng lực.

   ĐIỂM KPI không lưu sẵn: tính từ dữ liệu thật mỗi lần xem bằng modules/kpi-calc.js (công thức + nguồn dữ
   liệu từng tiêu chí ghi ở đầu file đó; máy chủ dùng CHÍNH file đó để tính lại khi chốt). Người đã được
   CHỐT trong 1 kỳ (kpiReview, status "locked") thì hiển thị đúng bản điểm máy chủ đã lưu lúc chốt, không
   tính lại theo dữ liệu/cấu hình hiện hành nữa.
   Trạng thái đánh giá của 1 người trong 1 kỳ: chưa có bản đánh giá → "Chưa đánh giá"; có bản nháp → "Đang
   đánh giá"; đã chốt → "Đã chốt". Bản đánh giá chỉ ghi qua /api/kpi/review* (backend/lib/kpi.js).
   Luôn phân biệt "chưa có dữ liệu" (null, hiện "–") với điểm 0. */
const KPI_DEFAULT = KPI_CALC.DEFAULT, KPI_CRIT = KPI_CALC.CRIT;
/* Vai trò xem/đánh giá KPI – phải khớp KPI_ROLES ở backend/server.js (máy chủ mới là nơi chặn thật) */
const KPI_VIEW_ROLES = new Set(["admin", "head", "deputy", "member"]); // xem: mọi tài khoản
const KPI_WRITE_ROLES = new Set(["admin", "head"]); // lưu/chốt/mở lại đánh giá: chỉ admin + trưởng phòng (máy chủ chặn y hệt)
const KPI_STATUS = {none:["Chưa đánh giá","mute"], draft:["Đang đánh giá","info"], locked:["Đã chốt","ok"]};
const KPI_TREND_N = 6;
ON_SESSION.push(db => {
  db.collection("config").onSnapshot(snap => {
    const doc = snap.docs.find(d=>d.id==="kpiCriteria");
    S.kpiCriteria = (doc && doc.data()) || KPI_DEFAULT;
    schedule();
  });
  db.collection("kpiNote").onSnapshot(snap => {
    S.kpiNotes = snap.docs.map(d=>({...d.data(), id:d.id}));
    schedule();
  });
  /* Bản đánh giá chỉ vai trò được phép mới đọc được (máy chủ trả 403 cho người khác) – không đăng ký nghe
     khi không có quyền, và xoá sạch bản đang giữ của phiên trước nếu đổi tài khoản. */
  S.kpiReviews = [];
  if(S.user && KPI_VIEW_ROLES.has(S.user.role)) db.collection("kpiReview").onSnapshot(snap => {
    S.kpiReviews = snap.docs.map(d=>({...d.data(), id:d.id}));
    schedule();
  }, () => {});
});
function kpiInit(){
  /* Kỳ mặc định = kỳ chứa thứ Hai của tuần này (tuần được tính vào kỳ theo thứ Hai của nó) */
  if(!S.kpi) S.kpi = {kind:"month", key:KPI_CALC.periodOf("month", mondayOf(todayISO())).key, q:"", sort:"kpi", dir:-1, sel:null, tab:"overview", fRating:"", fStatus:""};
  if(!S.kpiNotes) S.kpiNotes = [];
  if(!S.kpiReviews) S.kpiReviews = [];
}
const kpiCriteria = () => S.kpiCriteria || KPI_DEFAULT;
const kpiPeriod = () => KPI_CALC.periodByKey(S.kpi.kind, S.kpi.key) || KPI_CALC.periodOf(S.kpi.kind, mondayOf(todayISO()));
/* Dữ liệu dùng chung cho 1 lần vẽ: chỉ mục tính điểm + bảng tra bản đánh giá theo mã */
function kpiContext(){
  return {ix: KPI_CALC.prepare({staff:S.staff, projects:S.projects, weeks:S.weeks}), crit: kpiCriteria(),
    reviews: new Map((S.kpiReviews||[]).map(r=>[r.id, r]))};
}
/* Điểm + trạng thái của 1 người trong 1 kỳ. Đã chốt → dùng bản điểm (và ngưỡng xếp loại) lưu lúc chốt. */
function kpiRow(c, s, p){
  const rev = c.reviews.get(KPI_CALC.reviewId(p.kind, p.key, s.name)) || null;
  const live = KPI_CALC.compute(c.ix, s.name, p.weeks, c.crit);
  const snap = rev && rev.status==="locked" ? rev.snapshot : null;
  const scores = snap ? snap.scores : live.scores, kpi = snap ? snap.kpi : live.kpi;
  return {s, rev, live, scores, kpi, rating: KPI_CALC.rating(kpi, snap ? {thresholds:snap.thresholds} : c.crit),
    status: !rev ? "none" : rev.status==="locked" ? "locked" : "draft"};
}
const kpiNum = v => v==null ? "–" : v;
/* Nhãn "Độ khó dự án" – cùng 4 giá trị với ô chọn trong projectForm() (plan.js) */
const KPI_DIFF = {0.8:"Dễ", 1:"Trung bình", 1.3:"Khó", 1.6:"Cực khó"};
/* Dự án + đầu việc 1 người thực hiện trong kỳ, gộp ô theo dự án. Bấm 1 dòng mở form đầu việc (taskForm ở plan.js,
   qua data-act="task" của events.js) để trưởng phòng điền "Đánh giá khi hoàn thành" ngay tại đây. */
function kpiWorkHtml(groups){
  const all = groups.flatMap(g=>g.tasks), nDone = all.filter(t=>t.status==="Hoàn thành").length, nPending = all.filter(t=>t.pending).length;
  const ctr = v => `<td style="text-align:center">${v}</td>`;
  const rows = groups.map(g => g.tasks.map((t, i) => `<tr class="click${i===0?" kpi-wk-first":""}" data-act="task" data-pid="${esc(g.projectId)}" data-id="${esc(t.id)}">
      ${i===0?`<td rowspan="${g.tasks.length}" class="kpi-wk-proj"><div class="cell-main">${typeDot(g.type)}${esc(g.project)}</div>
        <div class="kpi-wk-tags">${g.difficulty!=null && KPI_DIFF[g.difficulty]?`<span class="pill info">Độ khó: ${KPI_DIFF[g.difficulty]}</span>`:'<span class="pill mute">Chưa đặt độ khó</span>'}${g.pRole?`<span class="pill mute">${g.pRole} dự án</span>`:""}</div>
        <div class="small muted">${g.tasks.length} đầu việc</div></td>`:""}
      <td class="cell-main">${esc(planShortName(t.dv))}</td>
      <td style="white-space:nowrap">${[t.owner?"Phụ trách":"", t.doer?"Thực hiện":""].filter(Boolean).join(" · ")}</td>
      <td style="text-align:center"${t.wlTotal!=null?` title="Cộng dồn ${t.nWeeks} tuần có nhập, từ tuần ${dmy(t.firstWeek)} đến tuần ${dmy(t.lastWeek)}"`:""}>${t.wlTotal!=null ? fmt1(t.wlTotal) : "–"}${t.wlTotal!=null && t.wl!==t.wlTotal ? `<div class="small muted" style="white-space:nowrap">kỳ này ${fmt1(t.wl||0)}</div>` : ""}</td>
      <td>${stPill(t.status)}</td>
      ${ctr(t.deadline ? dmy(t.deadline) : "–")}
      ${ctr(t.ontime===true?'<span class="pill ok">Đúng hạn</span>':t.ontime===false?'<span class="pill bad">Trễ hạn</span>':"–")}
      ${t.pending ? '<td colspan="3" style="text-align:center"><span class="pill info">Chờ đánh giá</span></td>'
        : ctr(t.dat ? `<span class="pill ${t.dat==="Đạt"?"ok":t.dat==="Không đạt"?"bad":"warn"}">${esc(t.dat)}</span>` : "–") + ctr(kpiNum(t.cl)) + ctr(kpiNum(t.tc))}
    </tr>`).join("")).join("");
  return `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Dự án và đầu việc thực hiện trong kỳ</h2>
      <span class="muted small">${groups.length} dự án · ${all.length} đầu việc · ${nDone} đã hoàn thành${nPending?` · ${nPending} chờ đánh giá`:""}</span></div>
    ${all.length ? `<div class="tbl-wrap"><table class="kpi-wk"><thead><tr><th>Dự án</th><th>Đầu việc</th><th>Vai trò</th><th style="text-align:center">Tổng workload (giờ)</th><th>Trạng thái</th>
        <th style="text-align:center">Hạn</th><th style="text-align:center">Tiến độ</th><th style="text-align:center">Đạt yêu cầu</th><th style="text-align:center">Chất lượng</th><th style="text-align:center">Tự chủ</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="panel-b small muted">Gồm đầu việc người này có nhập tuần trong kỳ, và đầu việc họ phụ trách hoặc được giao thực hiện được báo hoàn thành trong kỳ. “Tổng workload” cộng dồn mọi tuần người này đã nhập cho đầu việc, từ tuần đầu tới hết kỳ đang xem (tới tuần hoàn thành nếu việc đã xong) – dòng “kỳ này” là phần rơi vào riêng kỳ. Ba cột cuối lấy từ “Đánh giá khi hoàn thành” của trưởng phòng – bấm vào một dòng để mở đầu việc và đánh giá.</div>`
    : '<div class="empty"><b>Chưa có đầu việc nào trong kỳ</b>Người này chưa nhập tuần và không có đầu việc nào được báo hoàn thành trong kỳ này.</div>'}
    </section>`;
}

/* ----- giao diện: KPI tổng quan ----- */
/* Chọn kỳ nằm ngay trên dòng tiêu đề, cùng kiểu .ex-wk/.ex-seg + nút Làm mới (exrefresh) của Dashboard/Dự án/Báo cáo */
function kpiPeriodNav(p){
  return `<div class="ex-wk"><button data-act="kpinav" data-d="-1" aria-label="Kỳ trước">‹</button><div class="lb">${esc(p.label)}</div><button data-act="kpinav" data-d="1" aria-label="Kỳ sau">›</button></div>
    <div class="ex-seg" role="group" aria-label="Kỳ đánh giá">${[["month","Tháng"],["quarter","Quý"],["year","Năm"]].map(([v,l])=>`<button data-act="kpikind" data-v="${v}" aria-pressed="${p.kind===v}">${l}</button>`).join("")}</div>`;
}
/* Xu hướng KPI trung bình của phòng qua các kỳ liền nhau (1 chuỗi duy nhất nên không cần chú giải).
   points = [{label, short, v, n, total}] – v=null khi kỳ đó không ai có dữ liệu: bỏ trống, KHÔNG nối đường
   qua chỗ trống và không vẽ thành 0. Dựng bằng HTML + 1 SVG co giãn theo khung (không dùng thư viện): chấm,
   nhãn và ô gợi ý là phần tử HTML nên không bị méo khi khung đổi kích thước. Rê chuột/tab vào từng kỳ hiện
   vạch dọc + số liệu; bảng số liệu ngay bên dưới là bản thay thế cho người không dùng chuột/không nhìn màu. */
function kpiTrendHtml(points, target){
  if(!points.some(x=>x.v!=null)) return `<div class="empty"><b>Chưa có dữ liệu để vẽ xu hướng</b>Chưa có ai có điểm KPI trong ${points.length} kỳ gần nhất.</div>`;
  const n = points.length, x = i => (i+0.5)/n*100;
  const segs = []; let cur = [];
  points.forEach((pt, i) => { if(pt.v==null){ if(cur.length>1) segs.push(cur); cur = []; } else cur.push(`${x(i).toFixed(2)},${100-pt.v}`); });
  if(cur.length>1) segs.push(cur);
  const tip = pt => pt.v==null ? `<b>–</b><span>${esc(pt.label)}</span><span>Chưa có dữ liệu</span>`
    : `<b>${pt.v}</b><span>KPI trung bình · ${esc(pt.label)}</span><span>${pt.n}/${pt.total} người có dữ liệu</span>`;
  return `<div class="kpi-chart" role="group" aria-label="Xu hướng KPI trung bình ${n} kỳ gần nhất">
      <div class="kpi-y" aria-hidden="true"><span style="bottom:100%">100</span><span style="bottom:50%">50</span><span style="bottom:0">0</span></div>
      <div class="kpi-plot">
        ${[0,25,50,75,100].map(v=>`<i class="kpi-grid" style="bottom:${v}%"></i>`).join("")}
        <i class="kpi-target" style="bottom:${target}%"><span>Đạt yêu cầu từ ${target}</span></i>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs.map(s=>`<polyline points="${s.join(" ")}" vector-effect="non-scaling-stroke"/>`).join("")}</svg>
        ${points.map((pt, i) => `<div class="kpi-col${i===0?" first":""}${i===n-1?" last":""}${pt.v!=null&&pt.v>=55?" hi":""}" tabindex="0" style="left:${i/n*100}%; width:${100/n}%"
            aria-label="${esc(pt.label)}: ${pt.v==null?"chưa có dữ liệu":`KPI trung bình ${pt.v}, ${pt.n} trên ${pt.total} người có dữ liệu`}">
          ${pt.v!=null?`<b class="kpi-dot" style="bottom:${pt.v}%"></b>`:""}
          ${i===n-1&&pt.v!=null?`<span class="kpi-end${pt.v>=85?" below":""}" style="bottom:${pt.v}%">${pt.v}</span>`:""}
          <div class="kpi-tip">${tip(pt)}</div></div>`).join("")}
      </div>
      <div class="kpi-x" aria-hidden="true">${points.map(pt=>`<span>${esc(pt.short)}</span>`).join("")}</div>
    </div>
    <details class="kpi-tblview"><summary>Xem số liệu dạng bảng</summary>
      <div class="tbl-wrap"><table><thead><tr><th>Kỳ</th><th style="text-align:center">KPI trung bình</th><th style="text-align:center">Số người có dữ liệu</th></tr></thead>
      <tbody>${points.map(pt=>`<tr><td>${esc(pt.label)}</td><td style="text-align:center">${kpiNum(pt.v)}</td><td style="text-align:center">${pt.n}/${pt.total}</td></tr>`).join("")}</tbody></table></div>
    </details>`;
}
/* Biểu đồ mạng nhện: mỗi tiêu chí 1 trục (thang 0–100), 1 chuỗi duy nhất nên không cần chú giải. Dựng bằng SVG thuần.
   items = [{label, v, w}] – v=null là CHƯA CÓ DỮ LIỆU, khác điểm 0: trục đó vẽ nét đứt, không có chấm, viền không
   nối qua nó và vùng tô thu về tâm ở hướng đó (không "bịa" ra giá trị). Tiêu chí có dữ liệu nhưng cả 2 trục kề
   đều trống thì thêm 1 nét từ tâm ra chấm để vẫn đọc được độ lớn. Bảng bên cạnh là bản số liệu đầy đủ. */
function kpiRadarHtml(items){
  if(!items.some(x=>x.v!=null)) return `<div class="empty"><b>Chưa có dữ liệu trong kỳ</b>Chưa tiêu chí nào có số liệu để vẽ biểu đồ.</div>`;
  const n = items.length, W = 580, H = 330, cx = W/2, cy = 172, R = 112;
  const ang = i => (-90 + i*360/n) * Math.PI/180;
  const at = (i, d) => [cx + d*Math.cos(ang(i)), cy + d*Math.sin(ang(i))];
  const f = a => a.map(x=>x.toFixed(1)).join(",");
  const has = i => items[i].v!=null, P = i => at(i, R*items[i].v/100);
  const line = (a, b, cls) => `<line class="${cls}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
  const edges = items.map((_, i) => { const j = (i+1)%n, k = (i+n-1)%n;
    return (has(i)&&has(j) ? line(P(i), P(j), "kpi-rd-edge") : "") + (has(i)&&!has(j)&&!has(k) ? line([cx,cy], P(i), "kpi-rd-edge") : ""); }).join("");
  const labels = items.map((it, i) => { const [x, y] = at(i, R+14), c = Math.cos(ang(i)), sn = Math.sin(ang(i));
    const anchor = c>0.3 ? "start" : c<-0.3 ? "end" : "middle", y1 = sn<-0.5 ? y-18 : sn>0.5 ? y+12 : y-3;
    return `<text class="kpi-rd-lb" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}">${esc(it.label)}</text>
      <text class="${it.v==null?"kpi-rd-na":"kpi-rd-v"}" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${(y1+16).toFixed(1)}">${it.v==null?"Chưa có dữ liệu":it.v}</text>`; }).join("");
  return `<div class="kpi-rd"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Điểm theo tiêu chí: ${esc(items.map(it=>`${it.label} ${it.v==null?"chưa có dữ liệu":it.v}`).join("; "))}">
      ${[25,50,75,100].map(v=>`<polygon class="kpi-rd-ring${v===100?" out":""}" points="${items.map((_, i)=>f(at(i, R*v/100))).join(" ")}"/>`).join("")}
      ${items.map((_, i)=>line([cx,cy], at(i, R), "kpi-rd-axis"+(has(i)?"":" na"))).join("")}
      <polygon class="kpi-rd-area" points="${items.map((_, i)=>f(has(i)?P(i):[cx,cy])).join(" ")}"/>
      ${edges}
      ${[50,100].map(v=>`<text class="kpi-rd-tick" x="${cx+5}" y="${(cy-R*v/100+11).toFixed(1)}">${v}</text>`).join("")}
      ${items.map((it, i)=>{ if(!has(i)) return ""; const [x, y] = P(i);
        return `<g class="kpi-rd-pt"><title>${esc(it.label)}: ${it.v} điểm · trọng số ${it.w}%</title><circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14"/><circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/></g>`; }).join("")}
      ${labels}
    </svg></div>`;
}
/* Nhân sự của CHÍNH người đang xem: người đang chọn ở "Tôi là" (trưởng phòng/phó phòng/admin) hoặc nhân sự gắn với tài
   khoản (nhân viên). null khi chưa xác định được (vd đang xem "Tất cả" và tài khoản không gắn nhân sự). */
function kpiSelf(){
  const n = (S.me && S.me!=="__all__") ? S.me : (S.user && S.user.staff_name) || "";
  return M.staff.some(x=>x.name===n) ? n : null;
}
/* 2 tab ngang hàng như màn Dự án (.rp-tabs): Tổng quan (cả phòng; bấm 1 dòng mở trang của người đó, có nút quay lại)
   | Trang cá nhân (cố định theo góc nhìn của chính người đang xem) */
function kpiTabs(){
  const t = S.kpi.tab==="personal" ? "personal" : "overview";
  return `<div class="rp-tabs" role="tablist">
    <button type="button" role="tab" data-act="kputab" data-t="overview" aria-selected="${t==="overview"}">Tổng quan</button>
    <button type="button" role="tab" data-act="kputab" data-t="personal" aria-selected="${t==="personal"}">Trang cá nhân</button>
  </div>`;
}
function viewKpi(){
  if(!(S.user && KPI_VIEW_ROLES.has(S.user.role))) return `<div class="head"><div><h1>KPI &amp; Năng lực</h1></div></div>
    <section class="panel"><div class="empty"><b>Tính năng đang phát triển</b>Trang KPI &amp; Năng lực hiện đang hoàn thiện, sắp ra mắt.</div></section>`;
  kpiInit();
  if(S.kpi.tab==="personal"){
    const me = kpiSelf();
    if(me) return kpiDetailView(me, true);
    return `<div class="head"><div><h1>KPI &amp; Năng lực</h1></div></div>${kpiTabs()}
      <section class="panel"><div class="empty"><b>Chưa xác định được nhân sự của bạn</b>Chọn tên của bạn ở ô “Tôi là” (thanh bên) hoặc nhờ trưởng phòng gắn tài khoản với nhân sự, rồi quay lại tab này. Muốn xem người khác thì mở tab Tổng quan và bấm vào dòng của họ.</div></section>`;
  }
  if(S.kpi.sel && M.staff.some(x=>x.name===S.kpi.sel)) return kpiDetailView(S.kpi.sel, false);
  const p = kpiPeriod(), c = kpiContext();
  const rows = M.staff.map(s => kpiRow(c, s, p));
  const scored = rows.filter(r=>r.kpi!=null);
  const avgOf = list => { const a = list.filter(r=>r.kpi!=null); return a.length ? Math.round(a.reduce((x,r)=>x+r.kpi,0)/a.length) : null; };
  const th = c.crit.thresholds, target = (th[th.length-2]||th[0]).min; // ngưỡng thấp nhất còn được coi là đạt
  const nLocked = rows.filter(r=>r.status==="locked").length, nDraft = rows.filter(r=>r.status==="draft").length;
  const nPass = scored.filter(r=>r.kpi>=target).length, nReview = scored.length-nPass, nNoData = rows.length-scored.length;

  let h = `<div class="head"><div><h1>KPI &amp; Năng lực</h1></div>
    <div class="ex-ctl">${kpiPeriodNav(p)}
      <button class="btn icon" data-act="exrefresh" title="Làm mới" aria-label="Làm mới">${ICONS.refresh}</button></div></div>
    ${kpiTabs()}
    <div class="head-ctl" style="margin-bottom:16px">${S.canEdit?'<button class="btn" data-act="kpicfg">Cấu hình tiêu chí</button>':""}</div>`; // hàng công cụ riêng dưới tiêu đề, như hàng lọc của màn Dự án
  if(!rows.length) return h + `<section class="panel"><div class="empty"><b>Chưa có nhân sự</b>Thêm nhân sự ở Cài đặt → Nhân sự &amp; capacity để bắt đầu đánh giá.</div></section>`;
  h += `<div class="band">
    <div class="stat" title="${nDraft?`${nDraft} người đang đánh giá`:"Chưa có bản đang đánh giá dở"}"><div class="v">${nLocked}<span class="kpi-of">/${rows.length}</span></div><div class="l">Nhân viên đã chốt đánh giá</div></div>
    <div class="stat" title="${scored.length?`Trên ${scored.length} người có dữ liệu`:"Chưa ai có dữ liệu trong kỳ"}"><div class="v">${kpiNum(avgOf(rows))}</div><div class="l">Điểm KPI trung bình</div></div>
    <div class="stat" title="KPI từ ${target} trở lên"><div class="v">${scored.length?nPass:"–"}</div><div class="l">Nhân viên đạt mục tiêu</div></div>
    <div class="stat ${nReview?"bad":""}" title="KPI dưới ${target}${nNoData?` · ngoài ra ${nNoData} người chưa có dữ liệu`:""}"><div class="v">${scored.length?nReview:"–"}</div><div class="l">Trường hợp cần xem xét</div></div></div>`;

  const points = []; let q = p;
  for(let i=0; i<KPI_TREND_N; i++){ const rs = M.staff.map(s => kpiRow(c, s, q)); points.unshift({label:q.label, short:q.short, v:avgOf(rs), n:rs.filter(r=>r.kpi!=null).length, total:rs.length}); q = KPI_CALC.shift(q, -1); }
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Xu hướng KPI trung bình</h2><span class="muted small">${KPI_TREND_N} kỳ gần nhất · trung bình của những người có dữ liệu trong kỳ</span></div>
    <div class="panel-b">${kpiTrendHtml(points, target)}</div></section>`;

  const kw = (S.kpi.q||"").toLowerCase(), fR = S.kpi.fRating, fS = S.kpi.fStatus;
  const stOrder = {none:0, draft:1, locked:2}, sortKey = S.kpi.sort, dir = S.kpi.dir;
  const list = rows.filter(r => (!kw || r.s.name.toLowerCase().includes(kw)) && (!fS || r.status===fS) && (!fR || (fR==="__none__" ? !r.rating : r.rating && r.rating.label===fR)))
    .sort((a,b) => sortKey==="name" ? dir*a.s.name.localeCompare(b.s.name,"vi") : sortKey==="status" ? dir*(stOrder[a.status]-stOrder[b.status]) || a.s.name.localeCompare(b.s.name,"vi")
      : dir*((a.kpi??-1)-(b.kpi??-1)) || a.s.name.localeCompare(b.s.name,"vi"));
  const sortTh = (k, label, style) => `<th data-act="kpisorth" data-k="${k}" tabindex="0" style="cursor:pointer; ${style}" aria-sort="${sortKey===k?(dir>0?"ascending":"descending"):"none"}">${label}${sortKey===k?(dir>0?" ▲":" ▼"):""}</th>`;
  h += `<section class="panel"><div class="panel-h"><h2>Bảng đánh giá nhân sự <span class="muted small">· ${list.length}/${rows.length}</span></h2>
    <div class="toolbar">
      <input class="inp" style="width:190px" type="search" placeholder="Tìm nhân viên…" data-act="kpisearch" value="${esc(S.kpi.q||"")}" aria-label="Tìm nhân viên">
      <select class="inp" style="width:auto" data-act="kpifilter" data-k="fRating" aria-label="Lọc theo xếp loại"><option value="">Mọi xếp loại</option>${th.map(t=>`<option ${fR===t.label?"selected":""}>${esc(t.label)}</option>`).join("")}<option value="__none__" ${fR==="__none__"?"selected":""}>Chưa có dữ liệu</option></select>
      <select class="inp" style="width:auto" data-act="kpifilter" data-k="fStatus" aria-label="Lọc theo trạng thái đánh giá"><option value="">Mọi trạng thái</option>${Object.entries(KPI_STATUS).map(([k,v])=>`<option value="${k}" ${fS===k?"selected":""}>${v[0]}</option>`).join("")}</select>
    </div></div>
    <div class="tbl-wrap"><table class="kpi-tbl" style="table-layout:fixed"><thead><tr>
      ${sortTh("name","Nhân sự","width:18%")}
      ${KPI_CRIT.map(k=>`<th style="width:10%; text-align:center">${k.label}</th>`).join("")}
      ${sortTh("kpi","KPI","width:7%; text-align:center")}
      <th style="width:12%">Xếp loại</th>
      ${sortTh("status","Trạng thái","width:13%")}</tr></thead><tbody>
    ${list.length ? list.map(r => `<tr class="click" data-act="kpisel" data-name="${esc(r.s.name)}" tabindex="0">
        <td class="cell-main">${esc(r.s.name)}${r.s.title?`<div class="small muted">${esc(r.s.title)}</div>`:""}</td>
        ${KPI_CRIT.map(k=>`<td style="text-align:center">${kpiNum(r.scores[k.key])}</td>`).join("")}
        <td style="text-align:center; font-weight:700">${kpiNum(r.kpi)}</td>
        <td>${r.rating?`<span class="pill ${r.rating.cls}">${esc(r.rating.label)}</span>`:'<span class="pill mute">Chưa có dữ liệu</span>'}</td>
        <td><span class="pill ${KPI_STATUS[r.status][1]}">${KPI_STATUS[r.status][0]}</span></td></tr>`).join("")
      : `<tr><td colspan="${4+KPI_CRIT.length}" class="muted">Không có nhân sự nào khớp điều kiện tìm/lọc.</td></tr>`}
    </tbody></table></div>
    <div class="panel-b small muted">“–” nghĩa là chưa có dữ liệu trong kỳ, khác với điểm 0. “Năng lực &amp; phát triển” (${c.crit.weights.capability}%) hiện chưa có nguồn dữ liệu nên không tính vào KPI; trọng số các tiêu chí còn lại tự quy đổi theo đúng phần có dữ liệu. Người đã chốt hiển thị điểm lưu lúc chốt. Bấm vào một dòng để mở chi tiết.</div></section>`;
  return h;
}
/* ----- chi tiết 1 nhân viên (bố cục Giai đoạn 1 – sẽ làm lại theo tab ở bước 2) ----- */
/* name = nhân sự cần xem; self = true khi là tab "Trang cá nhân" của chính mình (không có nút quay lại) */
function kpiDetailView(name, self){
  const s = M.staff.find(x=>x.name===name);
  if(!s){ S.kpi.sel = null; return viewKpi(); }
  const p = kpiPeriod(), c = kpiContext(), r = kpiRow(c, s, p), lb = r.rating;
  const noteId = KPI_CALC.reviewId(p.kind, p.key, name); // mã kỳ chuẩn – không phụ thuộc cách điều hướng tới kỳ
  const note = (S.kpiNotes||[]).find(n=>n.id===noteId);
  /* Đầu trang cùng kiểu trang riêng của 1 dự án (projectPage() ở project-overview.js): tiêu đề chung của màn,
     rồi 1 thanh thông tin .me-sum (nhãn nhỏ + giá trị đậm, nhãn trạng thái, nút quay lại sát lề phải). */
  const cell = (label, val) => `<div><div class="small muted">${label}</div><div style="font-weight:700; font-size:17px">${val}</div></div>`;
  let h = `<div class="head"><div><h1>KPI &amp; Năng lực</h1></div>
    <div class="ex-ctl">${kpiPeriodNav(p)}
      <button class="btn icon" data-act="exrefresh" title="Làm mới" aria-label="Làm mới">${ICONS.refresh}</button></div></div>
    ${kpiTabs()}
    <section class="panel" style="margin-bottom:18px"><div class="panel-b me-sum me-sum-end">
      ${cell("Nhân sự", esc(name))}
      ${s.title?cell("Chức danh", esc(s.title)):""}
      ${cell("Kỳ đánh giá", esc(p.label))}
      ${cell("KPI tổng", kpiNum(r.kpi))}
      <div class="badges">${lb?`<span class="pill ${lb.cls}">${esc(lb.label)}</span>`:'<span class="pill mute">Chưa có dữ liệu</span>'}<span class="pill ${KPI_STATUS[r.status][1]}">${KPI_STATUS[r.status][0]}</span></div>
      ${self?"":'<div class="toolbar" style="margin-left:auto"><button class="btn" data-act="kpiback">← Quay lại tổng quan</button></div>'}
    </div></section>`;
  h += `<div class="band">
    ${KPI_CRIT.map(k=>`<div class="stat"><div class="v">${kpiNum(r.scores[k.key])}</div><div class="l">${k.label}</div></div>`).join("")}
  </div>`;
  const wts = (r.status==="locked" && r.rev.snapshot && r.rev.snapshot.weights) || c.crit.weights; // đã chốt → trọng số lúc chốt
  const crits = KPI_CRIT.map(k=>({label:k.label, v:r.scores[k.key], w:wts[k.key]}));
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Chi tiết từng tiêu chí</h2><span class="muted small">Thang 0–100 cho mỗi tiêu chí</span></div>
    <div class="panel-b kpi-rd-wrap">${kpiRadarHtml(crits)}
      <div class="tbl-wrap kpi-rd-list"><table><thead><tr><th>Tiêu chí</th><th style="text-align:center">Trọng số</th><th style="text-align:center">Điểm</th></tr></thead><tbody>
        ${crits.map(it=>`<tr><td>${esc(it.label)}</td><td style="text-align:center">${it.w}%</td><td style="text-align:center">${it.v==null?'<span class="muted small" style="white-space:nowrap">Chưa có dữ liệu</span>':`<b>${it.v}</b>`}</td></tr>`).join("")}
      </tbody></table></div>
    </div></section>`;
  h += kpiWorkHtml(KPI_CALC.work(c.ix, name, p.weeks));
  const hist = []; let q = p;
  for(let i=0; i<KPI_TREND_N; i++){ hist.unshift({label:q.label, kpi:kpiRow(c, s, q).kpi}); q = KPI_CALC.shift(q, -1); }
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Lịch sử KPI</h2><span class="muted small">${KPI_TREND_N} kỳ gần nhất · kỳ đã chốt giữ điểm lúc chốt, kỳ chưa chốt tính theo cấu hình hiện hành</span></div><div class="panel-b">
    ${hist.map(x=>`<div class="hbar"><span>${esc(x.label)}</span><div class="t"><i style="width:${x.kpi??0}%; background:${x.kpi==null?"var(--line-2)":"var(--indigo)"}"></i></div><span style="text-align:right">${kpiNum(x.kpi)}</span></div>`).join("")}
  </div></section>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Ma trận năng lực</h2></div><div class="panel-b"><div class="empty"><b>Chưa có dữ liệu</b>Ma trận năng lực theo chức danh sẽ được xây dựng ở bước sau (cần cấu hình nhóm kỹ năng &amp; cấp độ mục tiêu theo từng chức danh trước khi nhập minh chứng).</div></div></section>`;
  h += `<section class="panel"><div class="panel-h"><h2>Nhận xét của trưởng phòng</h2><button class="btn" data-act="kpinote" data-id="${esc(noteId)}" data-name="${esc(name)}">${note?"Sửa":"Thêm"} nhận xét</button></div>
    <div class="panel-b">${note&&note.text?`<p style="white-space:pre-wrap; margin:0">${esc(note.text)}</p>${note.updatedAt?`<div class="small muted" style="margin-top:6px">Cập nhật ${dmy(note.updatedAt.slice(0,10))}</div>`:""}`:'<div class="muted small">Chưa có nhận xét cho kỳ này.</div>'}</div></section>`;
  return h;
}
function kpiCriteriaForm(){
  const c = kpiCriteria();
  openForm({title:"Cấu hình tiêu chí KPI", subtitle:"Áp dụng cho mọi kỳ chưa chốt (kể cả kỳ cũ) ngay khi lưu; kỳ đã chốt giữ nguyên trọng số và ngưỡng lúc chốt",
    values:{...c.weights, thExcellent:c.thresholds[0].min, thGood:c.thresholds[1].min, thOk:c.thresholds[2].min},
    fields:[
      ...KPI_CRIT.map(k=>({key:k.key, label:`${k.label} (%)`, type:"number", half:true})),
      {heading:"Ngưỡng xếp loại (điểm KPI tối thiểu)"},
      {key:"thExcellent", label:"Xuất sắc, từ", type:"number", half:true},
      {key:"thGood", label:"Tốt, từ", type:"number", half:true},
      {key:"thOk", label:"Đạt yêu cầu, từ", type:"number", half:true}
    ],
    onSave: async v => {
      const weights = {}; let sum=0;
      for(const k of KPI_CRIT){ weights[k.key] = +v[k.key]||0; sum += weights[k.key]; }
      if(sum!==100) throw new Error(`Tổng trọng số phải bằng 100% (hiện đang là ${sum}%).`);
      const thresholds = [
        {min:+v.thExcellent||90, label:"Xuất sắc", cls:"ok"},
        {min:+v.thGood||80, label:"Tốt", cls:"info"},
        {min:+v.thOk||65, label:"Đạt yêu cầu", cls:"warn"},
        {min:0, label:"Cần cải thiện", cls:"bad"}
      ];
      await write("config/kpiCriteria", {weights, thresholds});
      toast("Đã lưu cấu hình tiêu chí KPI");
    }
  });
}
function kpiNoteForm(id, name){
  const note = (S.kpiNotes||[]).find(n=>n.id===id);
  openForm({title:"Nhận xét của trưởng phòng", subtitle:name,
    values:{text: note?note.text:""},
    fields:[{key:"text", label:"Nội dung nhận xét", type:"textarea", required:true}],
    saveLabel:"Lưu nhận xét",
    onSave: async v => { await write("kpiNote/"+id, {person:name, text:v.text.trim(), updatedAt:new Date().toISOString()}); toast("Đã lưu nhận xét"); },
    onDelete: note ? async()=>{ if(!confirm("Xoá nhận xét này?")) return false; await remove("kpiNote/"+id); toast("Đã xoá"); } : null
  });
}
/* Đổi loại kỳ: giữ nguyên mốc thời gian đang xem (kỳ mới là kỳ chứa tuần đầu của kỳ cũ) */
ACTIONS["kpikind"] = el => { kpiInit(); const p = kpiPeriod(); S.kpi.kind = el.dataset.v; S.kpi.key = KPI_CALC.periodOf(S.kpi.kind, p.weeks[0]).key; render(); };
ACTIONS["kpinav"] = el => { kpiInit(); S.kpi.key = KPI_CALC.shift(kpiPeriod(), +el.dataset.d).key; render(); };
ACTIONS["kpisel"] = el => { kpiInit(); S.kpi.sel = el.dataset.name; S.kpi.tab = "overview"; render(); main.scrollTop = 0; };
ACTIONS["kpiback"] = () => { kpiInit(); S.kpi.sel = null; render(); };
ACTIONS["kputab"] = el => { kpiInit(); S.kpi.tab = el.dataset.t==="personal" ? "personal" : "overview"; S.kpi.sel = null; render(); main.scrollTop = 0; };
ACTIONS["kpisorth"] = el => { kpiInit(); const k=el.dataset.k; if(S.kpi.sort===k) S.kpi.dir*=-1; else { S.kpi.sort=k; S.kpi.dir = k==="name"?1:-1; } render(); };
ACTIONS["kpicfg"] = () => kpiCriteriaForm();
ACTIONS["kpinote"] = el => kpiNoteForm(el.dataset.id, el.dataset.name);
main.addEventListener("input", e => {
  if(e.target.dataset.act!=="kpisearch") return;
  kpiInit(); S.kpi.q = e.target.value;
  const pos = e.target.selectionStart; render();
  const el = main.querySelector('[data-act="kpisearch"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); }
});
main.addEventListener("change", e => {
  if(e.target.dataset.act!=="kpifilter") return;
  kpiInit(); S.kpi[e.target.dataset.k] = e.target.value; render();
});
VIEW_RENDER.kpi = viewKpi;
ICONS.kpi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/><circle cx="12" cy="8" r="7"/></svg>';
{
  const i = VIEWS.findIndex(v=>v.id==="reports");
  VIEWS.splice((i<0?VIEWS.length-1:i)+1, 0, {id:"kpi", label:"KPI & Năng lực", icon:"kpi"});
}
