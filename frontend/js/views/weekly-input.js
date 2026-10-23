"use strict";
/* Màn hình: weekly input */
/* ================= VIEW: weekly input ================= */
function viewInput(){
  const w = S.week;
  S.wkMode = S.wkMode || "tasks"; // "tasks" (bảng đầu việc) | "journal" (Nhật ký tuần, xem worklog.js)
  let h = `<div class="head"><div><h1>Việc trong tuần</h1></div>${weekNav()}</div>${weekTabs()}`;
  if(S.me==="__all__") return h + viewInputAll(w);
  if(!S.me && S.user && !isFullRole(S.user.role)) return h + `<section class="panel"><div class="empty"><b>Tài khoản chưa gắn với nhân sự</b>Nhờ trưởng phòng vào Cài đặt → Tài khoản đăng nhập để gắn tài khoản của bạn với tên nhân sự.</div></section>`;
  if(!S.me) return h + `<section class="panel"><div class="empty"><b>Chọn tên của bạn</b>Chọn tên ở mục “Tôi là” (góc dưới thanh bên) để nhập công việc của mình.</div>
    <div class="panel-b" style="text-align:center"><select class="inp" style="max-width:280px" data-act="pickme"><option value="__all__">— Tất cả —</option>${M.staff.map(s=>`<option>${esc(s.name)}</option>`).join("")}</select></div></section>`;
  const st = M.staff.find(s=>s.name===S.me) || {cap:0};
  const L = loadFor(S.me, w); const u = st.cap ? L.wl/st.cap : null;
  /* Nhân viên không được sửa dữ liệu của tuần cũ (trước tuần hiện tại theo lịch) nữa, chỉ trưởng phòng
     mới can thiệp được (đã kiểm tra lại ở máy chủ, đây chỉ là khoá giao diện). */
  const locked = !S.canEdit && w < mondayOf(todayISO());
  const prev = weekDoc(addDays(w,-7), S.me);
  const canCopy = !locked && prev && (prev.entries||[]).some(e=>!["Hoàn thành","Hủy"].includes(e.status));
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-b me-sum">
    <div><div class="small muted">Người nhập</div><div style="font-weight:700; font-size:17px">${esc(S.me)}</div></div>
    <div><div class="small muted">Workload tuần</div><div style="font-weight:700; font-size:17px">${fmt1(L.wl)} <span class="muted small">/ ${fmt1(st.cap)} điểm</span></div></div>
    <div><div class="small muted">Mức sử dụng</div><div style="font-weight:700; font-size:17px; color:${u>1?"var(--bad)":u>=.8?"var(--warn)":"var(--ok)"}">${L.es.length?pct(u):"–"}</div></div>
    <div class="toolbar" style="margin-left:auto">
    ${`
    ${locked?"":`<button class="btn" data-act="copyprev" ${canCopy?"":"disabled"} title="${canCopy?"Chép các việc chưa xong của tuần trước":"Tuần trước không có việc dở dang"}">Chép việc dở dang từ tuần trước</button>
    <button class="btn" data-act="addinternal">+ Việc chung của phòng</button>
    <button class="btn primary" data-act="addentry">+ Thêm việc</button>`}`}</div></div></section>`;
  if(locked) h += `<p class="small muted" style="margin:-8px 0 14px">Tuần ${isoWeek(w)} đã qua, chỉ trưởng phòng mới sửa được dữ liệu tuần này.</p>`;
  if(!L.es.length) return h + `<section class="panel"><div class="empty"><b>Chưa có việc nào trong tuần ${isoWeek(w)}</b>${locked?"":"Thêm việc bạn làm trong tuần, hoặc chép các việc dở dang từ tuần trước."}</div></section>`;
  return h + `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:20%">Đầu việc</th><th style="width:20%">Việc làm</th><th style="width:8%; text-align:center">Giờ</th><th style="width:10%; text-align:center">Workload</th><th style="width:14%">Trạng thái</th><th style="width:12%">Ma sát</th><th style="width:16%">Vướng / cần hỗ trợ</th></tr></thead><tbody>${inputTreeRows(L.es, locked)}</tbody></table></section>
    ${locked?"":'<p class="small muted">Bấm vào một dòng để sửa hoặc xoá.</p>'}`;
}
/* "Tất cả" (chỉ trưởng phòng): liệt kê gộp việc đã nhập của mọi người trong tuần, gom theo người.
   Trưởng phòng bấm thẳng vào một dòng để sửa/xoá (entryForm nhận person của đúng dòng đó, không cần
   đổi "Tôi là"). */
function viewInputAll(w){
  const es = M.entries.filter(e=>e.week===w);
  if(!es.length) return `<section class="panel"><div class="empty"><b>Chưa có ai nhập việc trong tuần ${isoWeek(w)}</b></div></section>`;
  const byPerson = new Map();
  for(const e of es){ if(!byPerson.has(e.person)) byPerson.set(e.person, []); byPerson.get(e.person).push(e); }
  const people = [...byPerson.keys()].sort((a,b)=>a.localeCompare(b,"vi"));
  let rows = "";
  for(const person of people){
    const pes = byPerson.get(person), wl = pes.reduce((a,e)=>a+(e.wl||0),0);
    rows += inputGroupRow(0, person, `${pes.length} đầu việc · ${fmt1(wl)} điểm`, 7);
    for(const e of pes) rows += inputAllRow(e);
  }
  return `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:26%">Đầu việc</th><th style="width:16%">Việc làm</th><th style="width:7%; text-align:center">Giờ</th><th style="width:9%; text-align:center">Workload</th><th style="width:13%">Trạng thái</th><th style="width:12%">Ma sát</th><th style="width:17%">Vướng / cần hỗ trợ</th></tr></thead><tbody>${rows}</tbody></table></section>
    <p class="small muted">Bấm vào một dòng để sửa hoặc xoá.</p>`;
}
/* Cột "Ma sát" (mức độ + nguyên nhân) và "Vướng / cần hỗ trợ" (ghi chú) tách riêng 2 ô, không ghép chung
   bằng dấu " · " như trước – nguyên nhân đi cùng ma sát, không đi cùng ghi chú vướng mắc nữa. */
function inputAllRow(e){
  const name = e.taskName || (e.type==="Nội bộ" && e.work ? e.work.split("\n")[0] : e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)");
  const proj = (M.pById.get(e.projectId)||{}).name || "(dự án đã xoá)";
  return `<tr class="click" data-act="editentry" data-id="${esc(e.id)}" data-person="${esc(e.person)}" tabindex="0" title="${e.ref?esc(e.ref.t.dv):""}">
    <td style="padding-left:32px"><div class="small muted">${esc(proj)}</div><div class="cell-main">${esc(name)}</div></td>
    <td style="white-space:pre-wrap">${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td style="text-align:center">${e.hours??e.qm??"–"}</td><td style="text-align:center">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):"–"}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span> `:""}${esc(e.nn||"")}</td>
    <td class="small">${esc(e.note||"")}</td></tr>`;
}
/* Nhóm các dòng đã nhập theo Dự án → hạng mục (giống cây ở Kế hoạch dự án), gấp/mở được */
/* Màu viền trái theo cấp: đậm dần khi lên cấp cha, để nhìn ra ngay phân cấp mà không cần gấp/mở */
const INPUT_LVL_BORDER = ["var(--teal)", "color-mix(in srgb, var(--teal) 45%, var(--line))", "var(--line)"];
function inputRow(e, lvl=1, locked=false){
  const name = e.taskName || (e.type==="Nội bộ" && e.work ? e.work.split("\n")[0] : e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)");
  return `<tr ${locked?"":'class="click" data-act="editentry" data-id="'+esc(e.id)+'" tabindex="0"'} title="${e.ref?esc(e.ref.t.dv):""}">
    <td style="padding-left:${10+lvl*22}px; border-left:3px solid ${INPUT_LVL_BORDER[lvl]||INPUT_LVL_BORDER[2]}"><div class="cell-main">${esc(name)}</div></td>
    <td style="white-space:pre-wrap">${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td style="text-align:center">${e.hours??e.qm??'<span class="pill bad">Chọn giờ</span>'}</td><td style="text-align:center">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):'<span class="pill warn">Chọn trạng thái</span>'}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span>`:""} ${esc(e.nn||"")}</td>
    <td class="small">${esc(e.note||"")}</td></tr>`;
}
/* Dòng nhóm tĩnh (không gấp/mở) cho cây ở Nhập theo tuần – luôn hiện hết vì mỗi tuần thường chỉ có ít việc.
   Dòng dự án chỉ ghi tên (không ghi số đầu việc); số đầu việc chỉ ghi ở dòng hạng mục. */
function inputGroupRow(lvl, title, meta, cols=7){
  const bg = lvl===0 ? "color-mix(in srgb, var(--teal) 14%, var(--surface))" : "color-mix(in srgb, var(--teal) 6%, var(--surface))";
  const text = lvl===0 ? `<span style="font-weight:700; font-size:14.5px">${esc(title)}</span>`
    : `<span style="font-weight:650; color:var(--ink); font-size:13.5px">${esc(title)}</span> <span class="small muted">· ${esc(meta)}</span>`;
  return `<tr><td colspan="${cols}" style="background:${bg}; border-left:4px solid ${INPUT_LVL_BORDER[lvl]}; padding:${lvl?6:10}px 10px ${lvl?6:10}px ${10+lvl*22}px">${text}</td></tr>`;
}
function inputTreeRows(es, locked=false){
  const byProj = new Map();
  for(const e of es){
    const pid = e.projectId;
    if(!byProj.has(pid)) byProj.set(pid, {pid, name:(M.pById.get(pid)||{}).name||"(dự án đã xoá)", items:[]});
    byProj.get(pid).items.push(e);
  }
  const projects = [...byProj.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  let out = "";
  for(const g of projects){
    const p = M.pById.get(g.pid);
    out += inputGroupRow(0, g.name, `${g.items.length} đầu việc`);
    const order = p ? new Map(p._phases.map((ph,i)=>[ph.code,i])) : new Map();
    const byPhase = new Map();
    for(const e of g.items){
      const code = p?.type==="Nội bộ" ? "" : e.ref ? phaseOf(e.ref.t.dv) : "";
      if(!byPhase.has(code)) byPhase.set(code, {code, name: p ? ((p._phases.find(ph=>ph.code===code)||{}).name||"") : "", items:[]});
      byPhase.get(code).items.push(e);
    }
    const phases = [...byPhase.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code));
    /* Thứ tự đầu việc trong từng hạng mục: theo đúng vị trí đã khai báo ở Kế hoạch dự án (p._tasks),
       không theo thứ tự người dùng nhập/thêm việc trong tuần. */
    const taskOrder = p ? new Map(p._tasks.map((t,i)=>[t.id,i])) : new Map();
    for(const ph of phases){
      ph.items.sort((a,b)=>(taskOrder.get(a.taskId)??999)-(taskOrder.get(b.taskId)??999));
      if(!ph.code){ for(const e of ph.items) out += inputRow(e, 1, locked); continue; } // không rõ hạng mục: hiện thẳng dưới dự án, không bọc "Khác"
      out += inputGroupRow(1, ph.code+". "+(ph.name||"Khác"), `${ph.items.length} đầu việc`);
      for(const e of ph.items) out += inputRow(e, 2, locked);
    }
  }
  return out;
}
function entryForm(entry, person, internalOnly=false){
  const isNew = !entry;
  const who = person || (entry && entry.person) || S.me;
  const e = entry ? {...entry} : {id:uid("e"), projectId:"", taskId:"", work:"", qm:null, hours:null, pt:null, status:"", ms:null, nn:"", note:""};
  if(isNew) e.taskIds = [];
  if(internalOnly) e.projectId = M.projects.find(p=>p.type==="Nội bộ")?.id || "";
  const isInternalId = pid => M.pById.get(pid)?.type==="Nội bộ";
  if(isInternalId(e.projectId) && !e.taskName) e.taskName = e.work?.split("\n")[0] || "";
  /* "Ghi chú của trưởng phòng" – không phải trường của riêng lượt nhập tuần (e.note là "Vướng mắc" của
     người nhập), mà đọc/ghi thẳng task.note của đúng đầu việc đang chọn – CÙNG một trường đang hiện ở
     Kế hoạch dự án (taskForm, plan.js), nên sửa bên nào cũng tự khớp bên kia (xem onSave bên dưới và
     route PATCH /api/doc/projects/:id/task-note ở server.js). */
  const taskRef0 = e.projectId && e.taskId ? M.taskMap.get(e.projectId+"|"+e.taskId) : null;
  e.mgrNote = taskRef0 ? (taskRef0.t.note||"") : "";
  e.deadline = taskRef0?.t.deadline || null;
  let deadlineBefore = e.deadline;
  const selectDeadline = (pid, tid, form) => {
    const ref = M.taskMap.get(pid+"|"+tid);
    deadlineBefore = ref?.t.deadline || null;
    form.setValue("deadline", deadlineBefore);
    form.setDisabled("deadline", !ref || !canManageProject(ref.p));
  };
  /* "Còn lại" hiển thị cho người nhập = capacity − tổng workload cả tuần (giống hệt số "Workload tuần"
     hiện ở đầu trang), để luôn khớp với con số họ vừa thấy, kể cả khi đang sửa một việc đã có sẵn.
     Khi KIỂM TRA lúc Lưu thì vẫn phải trừ riêng phần của chính việc đang sửa ra khỏi tổng trước (budgetH),
     nếu không thì mở sửa một việc đã lưu từ trước (không đổi gì) cũng sẽ bị báo vượt tải oan. */
  const stH = M.staff.find(s=>s.name===who) || {cap:0};
  const totalWl = M.entries.filter(x=>x.person===who && x.week===S.week && x.status!=="Hủy" && x.wl!=null).reduce((a,x)=>a+x.wl,0);
  const otherWl = M.entries.filter(x=>x.person===who && x.week===S.week && x.id!==e.id && x.status!=="Hủy" && x.wl!=null).reduce((a,x)=>a+x.wl,0);
  const remainH = Math.max(0, Math.round((stH.cap-totalWl)*10)/10);
  const budgetH = Math.max(0, Math.round((stH.cap-otherWl)*10)/10);
  /* Nhân viên chỉ chọn được dự án mình là TM/SE, hoặc có đầu việc được giao/phối hợp; trưởng phòng không giới hạn.
     Riêng dự án loại Nội bộ ("Việc chung của phòng": hỗ trợ, đào tạo, việc khác) mở cho MỌI tài khoản – đó
     là nơi ghi việc ngoài dự án của bất kỳ ai, không gán TM/SE/người làm cho riêng ai nên nếu lọc theo
     phân công thì nhân viên không bao giờ chọn được.
     Ẩn dự án đã hoàn thành 100%, trừ khi đó là dự án của dòng đang sửa (giữ lại để không mất dữ liệu) – không
     áp dụng cho Nội bộ: đầu việc ở đó dùng lặp lại hằng tuần, "Hoàn thành" chỉ là trạng thái của lượt nhập
     gần nhất chứ không phải dự án đã đóng. */
  const internal = p => p.type==="Nội bộ";
  const assigned = p => S.canEdit || internal(p) || projectAssigned(p, who) || (p.tasks||[]).some(t=>tOwners(t).includes(who) || tCollabs(t).includes(who));
  const closed = p => planIsDone(p) && !internal(p);
  /* Gom theo loại dự án (Triển khai/Thầu/Nội bộ) bằng optgroup, để phân biệt rõ Thầu với dự án triển khai
     thay vì liệt kê lẫn lộn một danh sách phẳng. */
  const projOpts = (() => {
    const list = M.projects.filter(p=>(internal(p) || (p.tasks||[]).length) && (assigned(p) || p.id===e.projectId) && (!closed(p) || p.id===e.projectId));
    const byType = new Map();
    for(const p of list){ if(!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push([p.id, p.name+(closed(p)?" (đã hoàn thành)":"")]); }
    return TYPES.filter(t=>byType.has(t)).map(t=>({group:t, options:byType.get(t)}));
  })();
  /* Xem được tất cả đầu việc của dự án (kể cả đã xong/huỷ), gom theo hạng mục */
  const taskOpts = (pid, keepId) => {
    const p = M.pById.get(pid); if(!p) return [];
    const order = new Map(p._phases.map((ph,i)=>[ph.code,i]));
    const groups = new Map();
    for(const t of p._tasks){
      const code = t.phase||"";
      if(!groups.has(code)) groups.set(code, {code, name:(p._phases.find(ph=>ph.code===code)||{}).name||"", items:[]});
      groups.get(code).items.push(t);
    }
    return [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code))
      .map(g => ({group:(g.code?g.code+". ":"")+(g.name||"Khác"), options:g.items.map(t=>[t.id, planShortName(t.dv)+(OPEN.has(t.status)||internal(p)?"":" ("+t.status+")")])}));
  };
  const multiTaskOpts = pid => taskOpts(pid);
  openForm({
    title: isNew ? "Thêm việc trong tuần" : "Sửa việc trong tuần",
    subtitle: `${who} · tuần ${isoWeek(S.week)} (${dm(S.week)} – ${dm(addDays(S.week,6))}) · còn lại ${fmt1(remainH)}h / ${fmt1(stH.cap)}h`,
    values: e,
    fields: [
      {key:"projectId", label:"Dự án", type:"select", options:projOpts, required:true, onChange:(v,f)=>{ f.setOptions(isNew?"taskIds":"taskId", isNew?multiTaskOpts(v):taskOpts(v)); selectDeadline(v, "", f); }},
      ...(isNew ? [{key:"taskIds", label:"Đầu việc (theo kế hoạch của dự án)", type:"multi", listStyle:true, placeholder:"– chọn –", options:multiTaskOpts(e.projectId), required:true, showIf:v=>!isInternalId(v.projectId), hint:"Mỗi đầu việc được lưu thành một dòng. Giờ và thông tin bên dưới áp dụng cho từng đầu việc đã chọn.", onChange:(ids,f)=>selectDeadline(document.getElementById("f_projectId").value, ids.length===1?ids[0]:"", f)}]
        : [{key:"taskId", label:"Đầu việc (theo kế hoạch của dự án)", type:"select", options:taskOpts(e.projectId, e.taskId), required:true, showIf:v=>!isInternalId(v.projectId), onChange:(v,f)=>selectDeadline(document.getElementById("f_projectId").value, v, f)}]),
      {key:"taskName", label:"Tên đầu việc chung", type:"text", required:true, showIf:v=>isInternalId(v.projectId), hint:"Tự đặt tên cụ thể, ví dụ: PoC Storage scale, Tư vấn lab bán dẫn PTIT. Mỗi đầu việc có giờ, trạng thái và vướng mắc riêng."},
      {key:"work", label:"Việc làm trong tuần", type:"textarea"},
      {key:"qm", label:"Quy mô (ước lượng, chỉ để tham khảo)", type:"seg", options:[[null,"Không"],...[1,2,3,4,5].map(n=>[n,String(n)])], half:true,
        /* Chỉ để ước lượng/tham khảo – không tham gia công thức tính tải nữa (xem hours bên dưới). */
        hint:v=>v?QM_HINT[v]:"Không bắt buộc – chọn mức ước lượng gần đúng nếu cần tham khảo."},
      {key:"hours", label:isNew?"Thời gian thực hiện / đầu việc":"Thời gian thực hiện", type:"number", min:0.5, max:32, step:0.5, required:true, half:true,
        hint:v=>isNew?"Giờ cho mỗi đầu việc; tổng giờ = giờ nhập × số đầu việc đã chọn.":"Số giờ dự kiến làm trong tuần cho đầu việc này, có thể nhập lẻ 0,5 giờ."},
      {key:"pt", label:"Độ phức tạp", type:"seg", half:true, options:[[null,"Mặc định"],...[1,2,3,4,5].map(n=>[n,String(n)])],
        hint:v=>v?PT_HINT[v]:""},
      {key:"deadline", label:"Deadline theo HĐ", type:"date", half:true, showIf:v=>!isInternalId(v.projectId) && (!isNew || v.taskIds?.length===1), disabled:!taskRef0 || !canManageProject(taskRef0.p), hint:"Dùng chung với đầu việc trong dự án; quyền sửa theo dự án. Khi chọn nhiều, mỗi đầu việc giữ deadline riêng."},
      {key:"status", label:"Trạng thái", type:"seg", options:ST_WEEK.map(s=>[s,s])},
      /* Ma sát = chọn cả mức độ lẫn nguyên nhân cùng lúc (2 ô cạnh nhau), tách hẳn khỏi "Vướng mắc / cần
         hỗ trợ" bên dưới – trước đây Nguyên nhân đứng riêng 1 dòng, dễ hiểu nhầm là đi cùng ghi chú vướng
         mắc. Nguyên nhân vẫn là trường "nn" như cũ, chỉ đổi cách trình bày. */
      {key:"ms", label:"Ma sát (chỉ khi bị vướng)", type:"seg", options:[[null,"Không"],...[1,2,3,4,5].map(n=>[n,String(n)])], half:true, hint:v=>({1:"Vướng nhẹ",2:"Vướng vừa",3:"Vướng nhiều",4:"Phụ thuộc nghiêm trọng",5:"Bị đình trệ"}[v]||"")},
      {key:"nn", label:"Nguyên nhân", type:"select", options:[["",""],...CAUSES.map(c=>[c,c])], half:true},
      {key:"note", label:"Vướng mắc / cần ai hỗ trợ", type:"textarea"},
      /* Cùng 1 trường task.note với "Ghi chú của trưởng phòng" ở Kế hoạch dự án (plan.js) – chỉ trưởng
         phòng/phó phòng/admin ghi được, để đưa hướng giải quyết ngay tại đây khi xem vướng mắc (vd từ
         chuông thông báo) mà không cần sang Kế hoạch dự án. */
      ...(e.projectId && e.taskId ? [{key:"mgrNote", label:"Ghi chú của trưởng phòng", type:"textarea", disabled:!S.canEdit, showIf:v=>!isInternalId(v.projectId),
        hint:()=>S.canEdit?"":"Chỉ trưởng phòng/phó phòng sửa được ghi chú này."}] : [])
    ],
    saveLabel: isNew ? "Thêm việc" : "Lưu thay đổi",
    onSave: async v => {
      const freeTask = isInternalId(v.projectId);
      if(isNew && !freeTask){
        const ids = [...new Set(v.taskIds||[])];
        if(!ids.length) throw new Error("Chọn ít nhất một đầu việc.");
        if(!(v.hours>=0.5 && v.hours<=32)) throw new Error("Thời gian thực hiện phải từ 0,5 đến 32 giờ cho mỗi đầu việc.");
        const refs = ids.map(id=>M.taskMap.get(v.projectId+"|"+id));
        if(refs.some(ref=>!ref)) throw new Error("Đầu việc không còn trong dự án. Vui lòng chọn lại.");
        const doc = weekDoc(S.week, who), list = [...(doc?.entries||[])];
        if(ids.some(id=>list.some(x=>x.projectId===v.projectId && x.taskId===id)))
          throw new Error("Có đầu việc đã có trong tuần. Bỏ chọn đầu việc đó rồi lưu lại.");
        const total = Math.round(v.hours*ids.length*10)/10;
        if(total>budgetH) throw new Error(`${ids.length} đầu việc × ${fmt1(v.hours)}h = ${fmt1(total)}h, vượt số giờ còn lại (${fmt1(budgetH)}h). Giảm giờ hoặc số đầu việc.`);
        const deadlineUpdates=ids.length===1 && (v.deadline||null)!==deadlineBefore
          ? [{projectId:v.projectId,taskId:ids[0],deadline:v.deadline||null,expectedDeadline:deadlineBefore}] : [];
        for(const taskId of ids) list.push({id:uid("e"), projectId:v.projectId, taskId, work:v.work||"", qm:v.qm||null, hours:v.hours, pt:v.pt||null, status:v.status||"", ms:v.ms??null, nn:v.nn||"", note:v.note||""});
        await saveWeek(S.week, who, list, deadlineUpdates);
        let syncFailed = false;
        for(const ref of refs){
          if(v.pt && v.pt!==ref.t.pt){
            try{ await S.db.api("PATCH", `/api/doc/projects/${v.projectId}/task-pt`, {taskId:ref.t.id, pt:v.pt}); }
            catch(err){ syncFailed = true; }
          }
        }
        toast(`Đã thêm ${ids.length} đầu việc (${fmt1(total)}h).${syncFailed?" Có đầu việc chưa đồng bộ được độ phức tạp vào dự án.":""}`);
        return;
      }
      if(freeTask){
        if(!v.taskName?.trim()) throw new Error("Nhập tên đầu việc chung.");
        v.taskId = entry?.taskName && entry.projectId===v.projectId ? entry.taskId : uid("internal");
      }
      if(!(v.hours>=0.5 && v.hours<=32)) throw new Error("Thời gian thực hiện phải từ 0,5 đến 32 giờ.");
      /* Tải tuần bằng số giờ thực hiện; độ phức tạp chỉ tham khảo. */
      const thisWl = Math.round(v.hours*10)/10;
      if(thisWl>budgetH) throw new Error(`Việc này tính tải ${fmt1(thisWl)}h, vượt quá phần còn lại dành cho việc này trong tuần (còn ${fmt1(budgetH)}h, sau khi đã trừ các việc khác). Giảm giờ hoặc giảm bớt việc khác trước.`);
      const doc = weekDoc(S.week, who); const list = doc ? [...(doc.entries||[])] : [];
      const taskRef = M.taskMap.get(v.projectId+"|"+v.taskId);
      /* Mỗi đầu việc chỉ 1 dòng/tuần – trừ MỌI đầu việc của dự án Nội bộ ("Việc chung của phòng": hỗ trợ, đào
         tạo, việc khác…): mỗi lần chọn là một việc lặt vặt khác nhau (ghi rõ ở "Việc làm trong tuần"), nên được thêm
         bao nhiêu dòng giống nhau trong tuần cũng được. */
      const anyTimes = freeTask;
      if(!anyTimes && list.some(x=>x.id!==v.id && x.projectId===v.projectId && x.taskId===v.taskId))
        throw new Error("Đầu việc này đã có trong tuần. Bấm vào dòng đó trong bảng để sửa thay vì thêm mới.");
      const deadlineUpdates=taskRef && (v.deadline||null)!==deadlineBefore
        ? [{projectId:v.projectId,taskId:v.taskId,deadline:v.deadline||null,expectedDeadline:deadlineBefore}] : [];
      const i = list.findIndex(x=>x.id===v.id); const clean = {id:v.id, projectId:v.projectId, taskId:v.taskId, ...(freeTask ? {taskName:v.taskName.trim()} : {}), work:v.work||"", qm:v.qm||null, hours:v.hours, pt:v.pt||null, status:v.status||"", ms:v.ms??null, nn:v.nn||"", note:v.note||""};
      if(i>=0) list[i]=clean; else list.push(clean);
      await saveWeek(S.week, who, list, deadlineUpdates); toast(isNew?"Đã thêm việc":"Đã lưu thay đổi");
      /* Nhân viên tự đánh giá Độ phức tạp ngay trong tuần → đồng bộ về đúng đầu việc ở Kế hoạch dự án,
         không chỉ dùng cho mỗi tuần này. Không chặn việc lưu tuần nếu đồng bộ thất bại (vd không đủ quyền).
         Bỏ qua với dự án Nội bộ: đầu việc ở đó là "rổ" dùng chung cho nhiều việc khác nhau của nhiều người,
         độ phức tạp chỉ có nghĩa cho riêng lượt nhập này (và nhân viên cũng không có quyền ghi đầu việc đó). */
      if(v.pt && taskRef && !internal(taskRef.p) && v.pt !== taskRef.t.pt){
        try{ await S.db.api("PATCH", `/api/doc/projects/${v.projectId}/task-pt`, {taskId:v.taskId, pt:v.pt}); }
        catch(e){ toast("Đã lưu việc trong tuần, nhưng không đồng bộ được độ phức tạp vào Kế hoạch dự án."); }
      }
      /* Đồng bộ "Ghi chú của trưởng phòng" về đúng đầu việc – chỉ gửi khi có đổi và người lưu đủ quyền
         (ô bị khoá với nhân viên nên v.mgrNote khi đó luôn bằng giá trị cũ, không gửi thừa). */
      if(S.canEdit && taskRef && v.mgrNote!==undefined && v.mgrNote!==(taskRef.t.note||"")){
        try{ await S.db.api("PATCH", `/api/doc/projects/${v.projectId}/task-note`, {taskId:v.taskId, note:v.mgrNote||""}); }
        catch(e){ toast("Đã lưu việc trong tuần, nhưng không đồng bộ được ghi chú trưởng phòng vào Kế hoạch dự án."); }
      }
    },
    onDelete: isNew ? null : async () => {
      const doc = weekDoc(S.week, who); const list = (doc.entries||[]).filter(x=>x.id!==e.id);
      await saveWeek(S.week, who, list); toast("Đã xoá việc");
    }
  });
}
async function copyPrev(){
  const prev = weekDoc(addDays(S.week,-7), S.me); if(!prev) return;
  const doc = weekDoc(S.week, S.me); const list = doc ? [...(doc.entries||[])] : [];
  const have = new Set(list.map(x=>x.projectId+"|"+x.taskId));
  let n=0;
  for(const e of prev.entries||[]){
    if(["Hoàn thành","Hủy"].includes(e.status) || have.has(e.projectId+"|"+e.taskId) && (e.taskName || M.pById.get(e.projectId)?.type!=="Nội bộ")) continue;
    const common = M.pById.get(e.projectId)?.type==="Nội bộ";
    list.push({id:uid("e"), projectId:e.projectId, taskId:common && !e.taskName ? uid("internal") : e.taskId, ...(common ? {taskName:e.taskName || e.work?.split("\n")[0] || "Việc chung"} : {}), work:"", hours:null, pt:e.pt||null, status:"", ms:null, nn:"", note:""}); n++;
  }
  if(!n){ toast("Không có việc nào cần chép."); return; }
  await saveWeek(S.week, S.me, list); toast(`Đã chép ${n} việc – hãy cập nhật số giờ và trạng thái.`);
}


/* Mục "Việc trong tuần" = 2 tab ngang hàng (.rp-tabs, như màn Dự án): "Tải tuần" (cả phòng/1 người theo "Tôi là", xem
   weekly-load.js) và "Đầu việc" (bảng nhập việc từng tuần, viewInput() ở trên). Mặc định: trưởng phòng/phó phòng/admin
   mở Tải tuần, nhân viên mở Đầu việc (đúng màn mỗi nhóm hay dùng nhất trước khi gộp). */
function weekTabs(){
  const t = S.weekTab==="load" ? "load" : S.weekTab==="calendar" ? "calendar" : "tasks";
  return `<div class="rp-tabs" role="tablist">
    <button type="button" role="tab" data-act="weektab" data-t="load" aria-selected="${t==="load"}">Tải tuần</button>
    <button type="button" role="tab" data-act="weektab" data-t="tasks" aria-selected="${t==="tasks"}">Đầu việc</button>
    <button type="button" role="tab" data-act="weektab" data-t="calendar" aria-selected="${t==="calendar"}">Lịch</button>
  </div>`;
}
function viewWeek(){
  if(!S.weekTab) S.weekTab = S.canEdit ? "load" : "tasks";
  if(S.weekTab==="calendar") return viewCalendar(); // modules/calendar.js (nạp sau, chỉ gọi lúc vẽ)
  return S.weekTab==="load" ? viewLoad() : viewInput();
}
ACTIONS["weektab"] = el => { S.weekTab = ["load","calendar"].includes(el.dataset.t) ? el.dataset.t : "tasks"; render(); };
VIEW_RENDER.input = viewWeek;
