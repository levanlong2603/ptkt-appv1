"use strict";
/* Tính điểm KPI – MỘT bộ mã DÙNG CHUNG cho trình duyệt (modules/kpi.js, tính để hiển thị) và máy chủ
   (backend/lib/kpi.js, tính lại khi chốt kỳ để điểm lưu lại không phụ thuộc vào thứ trình duyệt gửi lên).
   Thuần tính toán trên dữ liệu thô (config/staff, projects, weeks, config/kpiCriteria) – không đọc S/M,
   không đụng DOM. Trên trình duyệt là classic script (nạp trước kpi.js, dùng hàm toàn cục của core/utils.js
   và core/constants.js); trên Node thì require 2 file lõi đó (cùng một nguồn hệ số, không chép lại).

   CÔNG THỨC (giữ nguyên như kpi.js Giai đoạn 1 – muốn đổi phải thống nhất nghiệp vụ trước):
     - Khối lượng  = workload đã nhập trong kỳ ÷ (Capacity/tuần × số tuần của kỳ), tối đa 100; không có lượt
                     nhập nào trong kỳ → chưa có dữ liệu (null), KHÔNG phải 0.
     - Độ khó      = độ phức tạp (1–5) trung bình có trọng số workload của các lượt nhập có chọn độ phức tạp,
                     quy về 0–100: (TB − 1) ÷ 4.
     - Chất lượng  = điểm "Chất lượng" (1–5) ở Đánh giá khi hoàn thành của đầu việc người đó Phụ trách, hoàn
                     thành trong kỳ, quy về 0–100.
     - Tiến độ     = tỉ lệ đầu việc Phụ trách hoàn thành trong kỳ đúng hạn (tuần hoàn thành ≤ deadline).
     - Năng lực    = chưa có nguồn dữ liệu → luôn null.
     KPI tổng = trung bình có trọng số của các tiêu chí CÓ dữ liệu (thiếu dữ liệu không bị coi là 0 điểm).
   "Hoàn thành trong kỳ" = tuần đầu tiên có lượt nhập đánh dấu Hoàn thành nằm trong kỳ; đầu việc chỉ đặt
   "Hoàn thành" ở trạng thái ban đầu (không qua nhập tuần) không có mốc thời gian nên không thuộc kỳ nào. */
const KPI_CALC = (() => {
  const onNode = typeof module!=="undefined" && !!module.exports;
  const U = onNode ? require("../core/utils.js") : {iso, parse, addDays, mondayOf, slug};
  const K = onNode ? require("../core/constants.js") : {PT_MULT, wlOf};

  const DEFAULT = {
    weights: {volume:20, difficulty:20, quality:25, progress:20, capability:15},
    thresholds: [{min:90,label:"Xuất sắc",cls:"ok"},{min:80,label:"Tốt",cls:"info"},{min:65,label:"Đạt yêu cầu",cls:"warn"},{min:0,label:"Cần cải thiện",cls:"bad"}]
  };
  const CRIT = [
    {key:"volume", label:"Khối lượng công việc"},
    {key:"difficulty", label:"Độ khó & đóng góp"},
    {key:"quality", label:"Chất lượng công việc"},
    {key:"progress", label:"Tiến độ & cam kết"},
    {key:"capability", label:"Năng lực & phát triển"}
  ];
  const KINDS = ["month", "quarter", "year"];

  /* ---- kỳ đánh giá: mã chuẩn "2026-10" (tháng) | "2026-Q4" (quý) | "2026" (năm) ---- */
  function build(kind, y, m0){
    const m1 = kind==="month" ? m0 : kind==="quarter" ? m0+2 : 11;
    const q = Math.floor(m0/3)+1;
    const key = kind==="month" ? `${y}-${String(m0+1).padStart(2,"0")}` : kind==="quarter" ? `${y}-Q${q}` : String(y);
    const label = kind==="month" ? `Tháng ${m0+1}/${y}` : kind==="quarter" ? `Quý ${q}/${y}` : `Năm ${y}`;
    /* nhãn ngắn dưới trục biểu đồ: năm 2 chữ số (T10/26) để vừa 6 cột trên màn điện thoại */
    const yy = String(y).slice(2), short = kind==="month" ? `T${m0+1}/${yy}` : kind==="quarter" ? `Q${q}/${yy}` : String(y);
    /* Tuần thuộc kỳ nếu thứ Hai của tuần đó nằm trong kỳ – khớp periodInfo() (exec-dashboard.js) */
    const weeks = []; let w = U.mondayOf(U.iso(new Date(y, m0, 1)));
    if(U.parse(w).getMonth()!==m0) w = U.addDays(w, 7);
    for(;;){ const d = U.parse(w); if(d.getFullYear()!==y || d.getMonth()>m1) break; weeks.push(w); w = U.addDays(w, 7); }
    return {kind, key, label, short, weeks, y, m0};
  }
  /* Kỳ chứa 1 ngày (YYYY-MM-DD) */
  function periodOf(kind, date){
    if(!KINDS.includes(kind)) return null;
    const d = U.parse(date), m = d.getMonth();
    return build(kind, d.getFullYear(), kind==="month" ? m : kind==="quarter" ? Math.floor(m/3)*3 : 0);
  }
  /* Kỳ theo mã chuẩn; mã sai định dạng → null */
  function periodByKey(kind, key){
    const s = String(key ?? ""); let m;
    if(kind==="month" && (m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s))) return build(kind, +m[1], +m[2]-1);
    if(kind==="quarter" && (m = /^(\d{4})-Q([1-4])$/.exec(s))) return build(kind, +m[1], (+m[2]-1)*3);
    if(kind==="year" && (m = /^(\d{4})$/.exec(s))) return build(kind, +m[1], 0);
    return null;
  }
  function shift(p, dir){
    const step = p.kind==="month" ? 1 : p.kind==="quarter" ? 3 : 12;
    const d = new Date(p.y, p.m0 + step*dir, 1);
    return build(p.kind, d.getFullYear(), d.getMonth());
  }
  const reviewId = (kind, key, person) => `${kind}-${key}__${U.slug(person)}`;

  /* ---- chỉ mục dữ liệu thô, dựng 1 lần rồi tính cho nhiều người/nhiều kỳ ----
     data = {staff:[{name,hours,pct,factor}], projects:[{id,name,tasks:[…]}], weeks:[{id|_id, week, person, entries:[…]}]}
     Tài liệu tuần được xếp theo (tuần, mã) trước khi duyệt để trình duyệt và máy chủ cho cùng kết quả dù
     CSDL trả về theo thứ tự nào (chỉ ảnh hưởng khi 2 người cùng báo trạng thái khác nhau cho 1 đầu việc
     trong cùng tuần mới nhất). */
  function prepare(data){
    const cap = new Map((data.staff||[]).map(s => [s.name, Math.round((+s.hours||0)*(1-(+s.pct||0))*(+s.factor||1)*10)/10]));
    const docs = [...(data.weeks||[])].sort((a,b) => String(a.week).localeCompare(String(b.week)) || String(a.id||a._id||"").localeCompare(String(b.id||b._id||"")));
    const entries = [], latest = new Map(), doneWk = new Map();
    for(const w of docs) for(const e of (w.entries||[])){
      const wl = e.hours!=null ? Math.round(e.hours*(e.pt ? K.PT_MULT[e.pt] : 1)*10)/10 : K.wlOf(e.qm, e.pt);
      const en = {week:w.week, person:w.person, projectId:e.projectId, taskId:e.taskId, status:e.status||"", pt:e.pt||null, wl, hours:e.hours!=null ? +e.hours||0 : null};
      entries.push(en);
      const k = e.projectId+"|"+e.taskId;
      if(en.status){ const cur = latest.get(k); if(!cur || en.week > cur.week) latest.set(k, en); }
      if(en.status==="Hoàn thành"){ const d = doneWk.get(k); if(!d || en.week < d) doneWk.set(k, en.week); }
    }
    const tasks = [];
    for(const p of (data.projects||[])) for(const t of (p.tasks||[])){
      const k = p.id+"|"+t.id, le = latest.get(k);
      const status = le ? le.status : ((t.init && t.init.status) || "Chưa bắt đầu");
      const done = status==="Hoàn thành" ? (doneWk.get(k) || null) : null;
      tasks.push({projectId:p.id, project:p.name, id:t.id, dv:t.dv, owner:t.owner||"", pt:t.pt??null, deadline:t.deadline||null,
        status, done, ontime: done && t.deadline ? done <= t.deadline : null, cl: t.eval && t.eval.cl!=null ? t.eval.cl : null,
        /* các trường dưới chỉ phục vụ work() (liệt kê dự án/đầu việc của 1 người) – compute() không đọc tới */
        collab:t.collab||"", ptype:p.type||"", difficulty:p.difficulty??null, pOwner:p.owner||"", pSe:p.se||"",
        dat:(t.eval && t.eval.dat) || null, tc: t.eval && t.eval.tc!=null ? t.eval.tc : null});
    }
    return {cap, entries, tasks};
  }
  /* ---- điểm của 1 người trong 1 kỳ (weeks = các thứ Hai thuộc kỳ) ---- */
  function compute(ix, name, weeks, criteria){
    const wset = new Set(weeks), cap = ix.cap.get(name) || 0, capPeriod = cap*weeks.length;
    const mine = ix.entries.filter(e => e.person===name && wset.has(e.week) && e.status!=="Hủy");
    const wl = mine.reduce((a,e) => a+(e.wl||0), 0);
    const volume = mine.length ? Math.min(100, Math.round(capPeriod ? wl/capPeriod*100 : 0)) : null;
    let ptWl = 0, ptW = 0;
    for(const e of mine) if(e.pt && e.wl){ ptWl += e.pt*e.wl; ptW += e.wl; }
    const difficulty = ptW ? Math.round((ptWl/ptW - 1)/4*100) : null;
    const tasks = ix.tasks.filter(t => t.owner===name && t.done && wset.has(t.done));
    const rated = tasks.filter(t => t.cl!=null);
    const quality = rated.length ? Math.round(rated.reduce((a,t) => a+(t.cl-1)/4*100, 0)/rated.length) : null;
    const dated = tasks.filter(t => t.ontime!=null);
    const progress = dated.length ? Math.round(dated.filter(t => t.ontime).length/dated.length*100) : null;
    const scores = {volume, difficulty, quality, progress, capability:null};
    const weights = (criteria || DEFAULT).weights;
    let wsum = 0, ssum = 0;
    for(const k of Object.keys(scores)) if(scores[k]!=null){ wsum += weights[k]||0; ssum += scores[k]*(weights[k]||0); }
    return {scores, kpi: wsum ? Math.round(ssum/wsum) : null, wsum, nEntries:mine.length, nTasks:tasks.length, tasks,
      /* số liệu gốc của từng tiêu chí – để giải thích cách tính, không tham gia công thức */
      basis: {wl:Math.round(wl*10)/10, cap, nWeeks:weeks.length, capPeriod:Math.round(capPeriod*10)/10,
        ptAvg: ptW ? Math.round(ptWl/ptW*100)/100 : null, ptWl:Math.round(ptW*10)/10,
        nRated:rated.length, nDated:dated.length, nOntime:dated.filter(t => t.ontime).length}};
  }
  /* ---- dự án + đầu việc 1 người THỰC HIỆN trong kỳ (chỉ liệt kê, không tính điểm) ----
     Một đầu việc thuộc về người đó trong kỳ khi: (a) họ có lượt nhập tuần cho nó trong kỳ (trừ lượt "Hủy"), hoặc
     (b) họ là Phụ trách / người được giao Thực hiện của đầu việc và nó được báo Hoàn thành trong kỳ.
     Đầu việc đặt "Hoàn thành" ngay từ trạng thái ban đầu không có tuần hoàn thành nên không rơi vào (b) của kỳ nào.
     Một đầu việc thường kéo dài nhiều tuần mới xong, nên workload của nó là số CỘNG DỒN: wlTotal = tổng workload
     người đó đã nhập cho đầu việc từ tuần đầu tiên tới hết kỳ đang xem (nWeeks tuần, từ firstWeek đến lastWeek) –
     tức là tới tuần báo Hoàn thành nếu việc đã xong; wl/hours chỉ là phần rơi vào riêng kỳ đang xem.
     pending = đã Hoàn thành nhưng trưởng phòng chưa điền "Đánh giá khi hoàn thành" (cùng điều kiện với nhãn
     "Chờ đánh giá" ở Kế hoạch dự án). Trả về [{projectId, project, type, difficulty, pRole, tasks:[…]}] theo thứ tự dự án. */
  function work(ix, name, weeks){
    const wset = new Set(weeks), mine = new Map(), cum = new Map();
    const end = weeks.reduce((m, w) => w > m ? w : m, ""); // thứ Hai của tuần cuối cùng trong kỳ
    for(const e of ix.entries) if(e.person===name && e.status!=="Hủy"){
      const k = e.projectId+"|"+e.taskId;
      if(e.week <= end){
        const c = cum.get(k) || {wl:0, wks:new Set()};
        c.wl += e.wl||0; c.wks.add(e.week); cum.set(k, c);
      }
      if(!wset.has(e.week)) continue;
      const a = mine.get(k) || {n:0, wl:0, hours:0, hasHours:false};
      a.n++; a.wl += e.wl||0; if(e.hours!=null){ a.hours += e.hours; a.hasHours = true; }
      mine.set(k, a);
    }
    const groups = new Map();
    for(const t of ix.tasks){
      const a = mine.get(t.projectId+"|"+t.id), c = cum.get(t.projectId+"|"+t.id), isOwner = t.owner===name, isCollab = t.collab===name;
      const wks = c ? [...c.wks].sort() : [];
      const doneIn = !!(t.done && wset.has(t.done));
      if(!a && !((isOwner || isCollab) && doneIn)) continue;
      if(!groups.has(t.projectId)) groups.set(t.projectId, {projectId:t.projectId, project:t.project, type:t.ptype, difficulty:t.difficulty,
        pRole: t.pOwner===name ? "TM" : t.pSe===name ? "SE" : "", tasks:[]});
      groups.get(t.projectId).tasks.push({id:t.id, dv:t.dv, owner:isOwner, doer:isCollab || !!a, nEntries:a ? a.n : 0,
        hours: a && a.hasHours ? Math.round(a.hours*10)/10 : null, wl: a ? Math.round(a.wl*10)/10 : null,
        wlTotal: c ? Math.round(c.wl*10)/10 : null, nWeeks: wks.length, firstWeek: wks[0] || null, lastWeek: wks[wks.length-1] || null,
        status:t.status, deadline:t.deadline, done:t.done, doneIn, ontime:t.ontime, pt:t.pt, dat:t.dat, cl:t.cl, tc:t.tc,
        pending: t.status==="Hoàn thành" && !t.dat});
    }
    return [...groups.values()];
  }
  /* Xếp loại theo ngưỡng cấu hình; chưa có điểm → null (không xếp loại) */
  function rating(score, criteria){
    if(score==null) return null;
    const th = (criteria || DEFAULT).thresholds;
    for(const t of th) if(score>=t.min) return t;
    return th[th.length-1];
  }
  return {DEFAULT, CRIT, KINDS, periodOf, periodByKey, shift, reviewId, prepare, compute, work, rating};
})();
if(typeof module!=="undefined" && module.exports) module.exports = KPI_CALC;
