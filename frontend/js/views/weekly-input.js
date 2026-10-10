"use strict";
/* Màn hình: weekly input */
/* ================= VIEW: weekly input ================= */
function viewInput(){
  const w = S.week;
  let h = `<div class="head"><div><h1>Nhập theo tuần</h1></div>${weekNav()}</div>`;
  if(S.me==="__all__") return h + viewInputAll(w);
  if(!S.me && S.user && S.user.role!=="admin") return h + `<section class="panel"><div class="empty"><b>Tài khoản chưa gắn với nhân sự</b>Nhờ trưởng phòng vào Cài đặt → Tài khoản đăng nhập để gắn tài khoản của bạn với tên nhân sự.</div></section>`;
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
    <div class="toolbar" style="margin-left:auto">${locked?"":`<button class="btn" data-act="copyprev" ${canCopy?"":"disabled"} title="${canCopy?"Chép các việc chưa xong của tuần trước":"Tuần trước không có việc dở dang"}">Chép việc dở dang từ tuần trước</button>
    <button class="btn primary" data-act="addentry">+ Thêm việc</button>`}</div></div></section>`;
  if(locked) h += `<p class="small muted" style="margin:-8px 0 14px">Tuần ${isoWeek(w)} đã qua, chỉ trưởng phòng mới sửa được dữ liệu tuần này.</p>`;
  if(!L.es.length) return h + `<section class="panel"><div class="empty"><b>Chưa có việc nào trong tuần ${isoWeek(w)}</b>${locked?"":"Thêm việc bạn làm trong tuần, hoặc chép các việc dở dang từ tuần trước."}</div></section>`;
  return h + `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:20%">Đầu việc</th><th style="width:20%">Việc đã làm</th><th style="width:8%; text-align:center">Giờ</th><th style="width:10%; text-align:center">Workload</th><th style="width:14%">Trạng thái cuối tuần</th><th style="width:12%">Ma sát</th><th style="width:16%">Vướng / cần hỗ trợ</th></tr></thead><tbody>${inputTreeRows(L.es, locked)}</tbody></table></section>
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
    rows += inputGroupRow(0, person, `${pes.length} đầu việc · ${fmt1(wl)} điểm`, 6);
    for(const e of pes) rows += inputAllRow(e);
  }
  return `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:30%">Đầu việc</th><th style="width:18%">Việc đã làm</th><th style="width:8%; text-align:center">Giờ</th><th style="width:10%; text-align:center">Workload</th><th style="width:14%">Trạng thái cuối tuần</th><th style="width:20%">Ma sát / vướng mắc</th></tr></thead><tbody>${rows}</tbody></table></section>
    <p class="small muted">Bấm vào một dòng để sửa hoặc xoá.</p>`;
}
function inputAllRow(e){
  const name = e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)";
  const proj = (M.pById.get(e.projectId)||{}).name || "(dự án đã xoá)";
  return `<tr class="click" data-act="editentry" data-id="${esc(e.id)}" data-person="${esc(e.person)}" tabindex="0" title="${e.ref?esc(e.ref.t.dv):""}">
    <td style="padding-left:32px"><div class="small muted">${esc(proj)}</div><div class="cell-main">${esc(name)}</div></td>
    <td style="white-space:pre-wrap">${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td style="text-align:center">${e.hours??e.qm??"–"}</td><td style="text-align:center">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):"–"}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span> `:""}${esc(e.nn||"")}${e.note?` · ${esc(e.note)}`:""}</td></tr>`;
}
/* Nhóm các dòng đã nhập theo Dự án → hạng mục (giống cây ở Kế hoạch dự án), gấp/mở được */
/* Màu viền trái theo cấp: đậm dần khi lên cấp cha, để nhìn ra ngay phân cấp mà không cần gấp/mở */
const INPUT_LVL_BORDER = ["var(--teal)", "color-mix(in srgb, var(--teal) 45%, var(--line))", "var(--line)"];
function inputRow(e, lvl=1, locked=false){
  const name = e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)";
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
      const code = e.ref ? phaseOf(e.ref.t.dv) : "";
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
function entryForm(entry, person){
  const isNew = !entry;
  const who = person || (entry && entry.person) || S.me;
  const e = entry ? {...entry} : {id:uid("e"), projectId:"", taskId:"", work:"", qm:null, hours:null, pt:null, status:"", ms:null, nn:"", note:""};
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
     Ẩn dự án đã hoàn thành 100%, trừ khi đó là dự án của dòng đang sửa (giữ lại để không mất dữ liệu) */
  const assigned = p => S.canEdit || projectAssigned(p, who) || (p.tasks||[]).some(t=>t.owner===who || t.collab===who);
  /* Gom theo loại dự án (Triển khai/Thầu/Nội bộ) bằng optgroup, để phân biệt rõ Thầu với dự án triển khai
     thay vì liệt kê lẫn lộn một danh sách phẳng. */
  const projOpts = (() => {
    const list = M.projects.filter(p=>(p.tasks||[]).length && (assigned(p) || p.id===e.projectId) && (!planIsDone(p) || p.id===e.projectId));
    const byType = new Map();
    for(const p of list){ if(!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push([p.id, p.name+(planIsDone(p)?" (đã hoàn thành)":"")]); }
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
      .map(g => ({group:(g.code?g.code+". ":"")+(g.name||"Khác"), options:g.items.map(t=>[t.id, planShortName(t.dv)+(OPEN.has(t.status)?"":" ("+t.status+")")])}));
  };
  openForm({
    title: isNew ? "Thêm việc trong tuần" : "Sửa việc trong tuần",
    subtitle: `${who} · tuần ${isoWeek(S.week)} (${dm(S.week)} – ${dm(addDays(S.week,6))}) · còn lại ${fmt1(remainH)}h / ${fmt1(stH.cap)}h`,
    values: e,
    fields: [
      {key:"projectId", label:"Dự án", type:"select", options:projOpts, required:true, onChange:(v,f)=>{ f.setOptions("taskId", taskOpts(v)); }},
      {key:"taskId", label:"Đầu việc (theo kế hoạch của dự án)", type:"select", options:taskOpts(e.projectId, e.taskId), required:true},
      {key:"work", label:"Việc đã làm trong tuần", type:"textarea"},
      {key:"qm", label:"Quy mô (ước lượng, chỉ để tham khảo)", type:"seg", options:[1,2,3,4,5].map(n=>[n,String(n)]), required:true, half:true,
        /* Chỉ để ước lượng/tham khảo – không tham gia công thức tính tải nữa (xem hours bên dưới). */
        hint:v=>v?QM_HINT[v]:"Chọn mức ước lượng gần đúng nhất, chỉ để tham khảo."},
      {key:"hours", label:"Thời gian thực hiện (giờ thật)", type:"number", min:0.5, max:32, step:0.5, required:true, half:true,
        hint:"Số giờ thật bạn đã làm cho đúng đầu việc này trong tuần, có thể nhập lẻ 0,5 giờ."},
      {key:"pt", label:"Độ phức tạp (để trống = hệ số trung tính ×1)", type:"seg", options:[[null,"Mặc định"],...[1,2,3,4,5].map(n=>[n,String(n)])],
        /* Nhân vào Thời gian thực hiện để ra tải – đồng thời vẫn đồng bộ Độ phức tạp vừa chọn về đúng đầu
           việc trong Kế hoạch dự án khi lưu (xem onSave bên dưới), để dùng chung cho ước lượng kế hoạch. */
        hint:(v,vals)=>{
          const mult = v ? PT_MULT[v] : 1;
          const base = v ? `${PT_HINT[v]} (×${fmt1(mult)})` : "Mặc định, không điều chỉnh (×1)";
          return vals.hours ? `${base} — ${fmt1(vals.hours)}h × ${fmt1(mult)} = ${fmt1(Math.round(vals.hours*mult*10)/10)}h tính vào tải tuần.` : base;
        }},
      {key:"status", label:"Trạng thái cuối tuần", type:"seg", options:ST_WEEK.map(s=>[s,s])},
      {key:"ms", label:"Ma sát (chỉ khi bị vướng)", type:"seg", options:[[null,"Không"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:v=>({1:"Vướng nhẹ",2:"Vướng vừa",3:"Vướng nhiều",4:"Phụ thuộc nghiêm trọng",5:"Bị đình trệ"}[v]||"")},
      {key:"nn", label:"Nguyên nhân", type:"select", options:[["",""],...CAUSES.map(c=>[c,c])]},
      {key:"note", label:"Vướng mắc / cần ai hỗ trợ", type:"textarea"}
    ],
    saveLabel: isNew ? "Thêm việc" : "Lưu thay đổi",
    onSave: async v => {
      if(!v.qm) throw new Error("Chọn Quy mô (ước lượng).");
      if(!(v.hours>=0.5 && v.hours<=32)) throw new Error("Thời gian thực hiện phải từ 0,5 đến 32 giờ.");
      /* Tải tính vào hệ thống = Thời gian thực hiện (giờ thật) × hệ số Độ phức tạp, khớp với model.js/derive(). */
      const thisWl = Math.round(v.hours*(v.pt?PT_MULT[v.pt]:1)*10)/10;
      if(thisWl>budgetH) throw new Error(`Việc này tính tải ${fmt1(thisWl)}h (giờ × Độ phức tạp), vượt quá phần còn lại dành cho việc này trong tuần (còn ${fmt1(budgetH)}h, sau khi đã trừ các việc khác). Giảm giờ, giảm Độ phức tạp, hoặc giảm bớt việc khác trước.`);
      const doc = weekDoc(S.week, who); const list = doc ? [...(doc.entries||[])] : [];
      if(list.some(x=>x.id!==v.id && x.projectId===v.projectId && x.taskId===v.taskId))
        throw new Error("Đầu việc này đã có trong tuần. Bấm vào dòng đó trong bảng để sửa thay vì thêm mới.");
      const i = list.findIndex(x=>x.id===v.id); const clean = {id:v.id, projectId:v.projectId, taskId:v.taskId, work:v.work||"", qm:v.qm, hours:v.hours, pt:v.pt||null, status:v.status||"", ms:v.ms??null, nn:v.nn||"", note:v.note||""};
      if(i>=0) list[i]=clean; else list.push(clean);
      await saveWeek(S.week, who, list); toast(isNew?"Đã thêm việc":"Đã lưu thay đổi");
      /* Nhân viên tự đánh giá Độ phức tạp ngay trong tuần → đồng bộ về đúng đầu việc ở Kế hoạch dự án,
         không chỉ dùng cho mỗi tuần này. Không chặn việc lưu tuần nếu đồng bộ thất bại (vd không đủ quyền). */
      const taskRef = M.taskMap.get(v.projectId+"|"+v.taskId);
      if(v.pt && taskRef && v.pt !== taskRef.t.pt){
        try{ await S.db.api("PATCH", `/api/doc/projects/${v.projectId}/task-pt`, {taskId:v.taskId, pt:v.pt}); }
        catch(e){ toast("Đã lưu việc trong tuần, nhưng không đồng bộ được độ phức tạp vào Kế hoạch dự án."); }
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
    if(["Hoàn thành","Hủy"].includes(e.status) || have.has(e.projectId+"|"+e.taskId)) continue;
    list.push({id:uid("e"), projectId:e.projectId, taskId:e.taskId, work:"", hours:null, pt:e.pt||null, status:"", ms:null, nn:"", note:""}); n++;
  }
  if(!n){ toast("Không có việc nào cần chép."); return; }
  await saveWeek(S.week, S.me, list); toast(`Đã chép ${n} việc – hãy cập nhật số giờ và trạng thái.`);
}


VIEW_RENDER.input = viewInput;
