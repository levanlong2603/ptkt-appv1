"use strict";
/* Màn hình: settings */
/* ================= VIEW: settings ================= */
function viewSettings(){
  const ro = !S.canEdit;
  let h = `<div class="head"><div><h1>Cài đặt</h1></div></div>`;
  h += usersPanel();
  const icoDb = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>';
  const icoDownload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10m0 0 4-4m-4 4-4-4M4 19h16"/></svg>';
  const icoUpload = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17V7m0 0 4 4m-4-4-4 4M4 19h16"/></svg>';
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-b" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap">
    <div class="data-ico" style="background:var(--teal-soft); color:var(--teal-hover)">${icoDb}</div>
    <div style="flex:1; min-width:160px"><div class="data-t">Sao lưu &amp; khôi phục</div><div class="small muted">Dữ liệu phòng ban</div></div>
    ${S.canEdit?`<div class="toolbar">
      <button class="btn primary" data-act="exp-json" title="Tải toàn bộ dữ liệu hiện tại về máy">${icoDownload} Backup</button>
      <button class="btn" data-act="imp-json" title="Khôi phục từ file backup — THAY TOÀN BỘ dữ liệu hiện tại cho cả phòng">${icoUpload} Restore</button>
      <input type="file" accept=".json,application/json" id="impFile" hidden></div>`:""}
    </div></section>`;
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Nhân sự & capacity</h2>${ro?"":'<button class="btn primary" data-act="addstaff">+ Nhân sự</button>'}</div>
    <div class="tbl-wrap"><table class="settings-staff-table" style="table-layout:fixed"><thead><tr><th style="width:22%">Họ tên</th><th style="width:18%">Bộ phận</th><th style="width:15%">Chức danh</th><th style="width:12%">Kinh nghiệm (năm)</th><th style="width:21%">Mức năng lực</th><th style="width:12%">Capacity (giờ/tuần)</th></tr></thead><tbody>
    ${M.staff.map((s,i)=>`<tr class="${ro?"":"click"}" data-act="${ro?"":"editstaff"}" data-i="${i}" tabindex="0"><td class="cell-main">${esc(s.name)}</td><td>${esc(s.department||"–")}</td><td>${esc(s.title||"–")}</td><td>${s.years!=null?fmt1(s.years):"–"}</td><td><span class="pill mute">${esc(factorLevel(s.factor)?.name||"Chưa chọn")}</span></td><td><strong class="settings-staff-cap">${fmt1(s.cap)}</strong></td></tr>`).join("")||'<tr><td colspan="6" class="muted">Chưa có nhân sự.</td></tr>'}
    </tbody></table></div><div class="panel-b small muted">Mọi nhân sự có 40 giờ làm việc mỗi tuần. Mức năng lực chỉ để tham khảo, không thay đổi capacity.</div></section>`;
  h += staffOrphanPanel();
  for(const t of TYPES){
    const list = S.catalog.map((c,i)=>({...c,i})).filter(c=>c.type===t);
    h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>${typeDot(t)}Quy trình ${t.toLowerCase()} <span class="muted small">· ${list.length} đầu việc chuẩn</span></h2>${ro?"":`<button class="btn" data-act="addcat" data-t="${t}">+ Đầu việc chuẩn</button>`}</div>
      <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:40%">Đầu việc</th><th style="width:60%">Kết quả đầu ra</th></tr></thead><tbody>
      ${catTreeRows(list, ro, t)}
      </tbody></table></div></section>`;
  }
  return h;
}
/* Đầu việc chuẩn của một quy trình, gom theo hạng mục (mã đầu việc) dạng cây gấp/mở */
function catTreeRows(list, ro, type){
  const phs = phasesFor(type), order = new Map(phs.map((ph,i)=>[ph.code,i]));
  const groups = new Map();
  for(const c of list){
    const code = phaseOf(c.name);
    if(!groups.has(code)) groups.set(code, {code, name:(phs.find(ph=>ph.code===code)||{}).name||"", items:[]});
    groups.get(code).items.push(c);
  }
  const sorted = [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code));
  let out = "";
  for(const g of sorted){
    const key = "cat|"+type+"|"+g.code, open = planOpen(key);
    out += planGroupRow(key, 0, (g.code?g.code+". ":"")+(g.name||"Khác"), {meta:`${g.items.length} đầu việc chuẩn`}, open, "", 2);
    if(!open) continue;
    for(const c of g.items) out += `<tr class="${ro?"":"click"}" data-act="${ro?"":"editcat"}" data-i="${c.i}" tabindex="0" title="${esc(c.name)}"><td style="padding-left:36px"><div class="cell-main">${esc(planShortName(c.name))}</div></td><td class="small">${esc(c.result||"")}</td></tr>`;
  }
  return out;
}
function staffForm(i){
  const isNew = i==null; const s = isNew ? {name:"", department:"", title:"", hours:40, pct:0, factor:1.0, years:0} : {...S.staff[i]};
  openForm({title:isNew?"Thêm nhân sự":"Sửa nhân sự", values:{...s, hours:40},
    fields:[{key:"name", label:"Họ và tên", type:"text", required:true},
      {key:"department", label:"Bộ phận", type:"text", half:true},
      {key:"title", label:"Chức danh", type:"text", half:true},
      {key:"factor", label:"Năng lực (tham khảo)", type:"select", half:true, options:[["", "Chọn mức năng lực"], ...FACTOR_LEVELS.map(l=>[l.v, l.name])], hint:val=>factorLevel(val)?.desc||"Chọn một trong 5 cấp năng lực."},
      {key:"hours", label:"Giờ chuẩn / tuần (= 100% tải)", type:"number", half:true, disabled:true, hint:"Cố định 40 giờ/tuần cho mọi nhân sự."},
      {key:"years", label:"Kinh nghiệm (năm, tham khảo)", type:"number", min:0, step:0.5, half:true}],
    onSave: async x => {
      const name = x.name.trim(), old = isNew ? null : S.staff[i].name;
      if(!name) throw new Error("Nhập họ tên.");
      if(S.staff.some((q,k)=>k!==i && q.name===name)) throw new Error("Đã có nhân sự tên này.");
      const list=[...S.staff]; const row={...s, name, department:(x.department||"").trim(), title:(x.title||"").trim(), hours:40, pct:0, factor:factorLevel(x.factor)?.v ?? null, years:+x.years||0};
      if(isNew) list.push(row); else list[i]=row;
      /* Đổi tên: tên là khoá nối dữ liệu (dự án, đầu việc, tuần, nhật ký, tài khoản…) nên phải chuyển hết
         dữ liệu sang tên mới ở máy chủ TRƯỚC (POST /api/staff/rename, server.js), rồi mới lưu các ô còn lại. */
      if(old && old!==name){
        try{ await S.db.api("POST", "/api/staff/rename", {from:old, to:name}); }
        catch(e){ throw new Error((e && e.message) || "Không đổi được tên nhân sự."); }
        staffRenamedLocal(old, name);
      }
      await write("config/staff",{list}); toast(old && old!==name ? "Đã đổi tên và chuyển dữ liệu sang tên mới" : "Đã lưu nhân sự");
    },
    onDelete: isNew?null: async()=>{ if(!confirm("Xoá nhân sự này?")) return false; const list=S.staff.filter((_,k)=>k!==i); await write("config/staff",{list}); toast("Đã xoá"); }
  });
}
/* Sau khi máy chủ đã chuyển dữ liệu from → to: khớp lại các lựa chọn đang giữ tên cũ ở trình duyệt này
   ("Tôi là", nhân sự gắn với tài khoản đang đăng nhập, bộ lọc Nhân sự ở Báo cáo) và nạp lại danh sách tài khoản. */
function staffRenamedLocal(from, to){
  if(S.me===from){ S.me = to; store("me", to); }
  if(S.user && S.user.staff_name===from) S.user.staff_name = to;
  if(S.rp && S.rp.wkStaff===from) S.rp.wkStaff = to;
  S.users = null;
}
/* Tên còn nằm trong dữ liệu (TM/SE dự án, phụ trách/thực hiện đầu việc, tuần, nhật ký, tài khoản) nhưng
   KHÔNG có trong danh sách nhân sự – thường do nhân sự bị đổi tên trước khi có cơ chế chuyển dữ liệu, hoặc
   đã bị xoá. Những dữ liệu này không còn hiện theo người nào ở Tải tuần/KPI/"Tôi là". */
function staffOrphans(){
  const known = new Set(S.staff.map(s=>s.name)), m = new Map();
  const add = (n, k) => { if(!n || known.has(n)) return; const o = m.get(n) || {name:n, projects:0, tasks:0, weeks:0, users:0}; o[k]++; m.set(n, o); };
  for(const p of S.projects){
    for(const n of new Set([...pOwners(p), ...pSes(p)])) add(n, "projects"); // mỗi tên đếm 1 lần cho mỗi dự án dù vừa là TM vừa là SE
    for(const t of p.tasks||[]) for(const n of new Set([...tOwners(t), ...tCollabs(t)])) add(n, "tasks");
  }
  for(const w of S.weeks) add(w.person, "weeks");
  for(const w of S.worklogs||[]) add(w.person, "weeks");
  for(const u of S.users||[]) add(u.staff_name, "users");
  return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
}
/* Gợi ý nhân sự tương ứng với 1 tên mồ côi theo kiểu viết tắt quen dùng: tên + chữ đầu của họ và đệm
   ("Lê Minh Thắng" ↔ "ThangLM"), hoặc cùng tên chỉ khác dấu. Chỉ gợi ý khi có đúng 1 người khớp. */
function staffGuess(orphan){
  const flat = n => slug(n).replace(/-/g, "");
  const code = n => { const w = slug(n).split("-"); return w.length>1 ? w[w.length-1] + w.slice(0,-1).map(x=>x[0]).join("") : w[0]; };
  const hit = S.staff.filter(s => flat(s.name)===flat(orphan) || flat(s.name)===code(orphan) || code(s.name)===flat(orphan));
  return hit.length===1 ? hit[0].name : "";
}
function staffOrphanPanel(){
  if(!S.canEdit) return "";
  const list = staffOrphans(); if(!list.length) return "";
  const used = o => [o.projects&&`TM/SE ${o.projects} dự án`, o.tasks&&`${o.tasks} đầu việc`, o.weeks&&`${o.weeks} tuần đã nhập`, o.users&&`${o.users} tài khoản`].filter(Boolean).join(" · ");
  return `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Dữ liệu chưa gắn với nhân sự nào <span class="muted small">· ${list.length} tên</span></h2></div>
    <div class="panel-b small muted" style="padding-bottom:0">Các tên dưới đây còn nằm trong dự án, dữ liệu tuần hoặc tài khoản nhưng không có trong danh sách nhân sự ở trên (do đổi tên hoặc xoá nhân sự trước đây), nên dữ liệu của họ không hiện theo người nào. Chọn đúng nhân sự rồi bấm “Chuyển dữ liệu” để gắn lại.</div>
    <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:24%">Tên trong dữ liệu</th><th style="width:36%">Đang dùng ở</th><th style="width:24%">Chuyển cho nhân sự</th><th style="width:16%"></th></tr></thead><tbody>
    ${list.map(o => { const g = staffGuess(o.name); return `<tr><td class="cell-main">${esc(o.name)}</td><td class="small">${esc(used(o))}</td>
      <td><select class="inp" aria-label="Nhân sự nhận dữ liệu của ${esc(o.name)}"><option value="">— chọn —</option>${S.staff.map(s=>`<option ${s.name===g?"selected":""}>${esc(s.name)}</option>`).join("")}</select></td>
      <td style="text-align:right"><button class="btn" data-act="staffmove" data-from="${esc(o.name)}">Chuyển dữ liệu</button></td></tr>`; }).join("")}
    </tbody></table></div></section>`;
}
ACTIONS["staffmove"] = async el => {
  const from = el.dataset.from, to = el.closest("tr").querySelector("select").value;
  if(!to){ toast("Chọn nhân sự nhận dữ liệu."); return; }
  if(!confirm(`Chuyển toàn bộ dữ liệu đang gắn với “${from}” sang nhân sự “${to}”?`)) return;
  el.disabled = true;
  try{
    const n = await S.db.api("POST", "/api/staff/rename", {from, to});
    staffRenamedLocal(from, to);
    toast(`Đã chuyển sang ${to}: ${n.projects} dự án, ${n.weeks} tuần, ${n.users} tài khoản`);
  }catch(e){ el.disabled = false; toast((e && e.message) || "Không chuyển được dữ liệu."); }
};
function catForm(i, type){
  const isNew = i==null; const c = isNew ? {type, name:"", result:"", evidence:""} : {...S.catalog[i]};
  openForm({title:isNew?"Thêm đầu việc chuẩn":"Sửa đầu việc chuẩn", subtitle:"Quy trình "+c.type.toLowerCase(), values:c,
    fields:[{key:"name", label:"Tên đầu việc", type:"text", required:true, hint:()=>"Giữ mã giai đoạn ở đầu tên, ví dụ “05. Thiết kế – LLD”, “T3. Hồ sơ kỹ thuật – …”."},
      {key:"result", label:"Kết quả đầu ra", type:"textarea"}, {key:"evidence", label:"Chú thích", type:"text"}],
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập tên đầu việc.");
      const list=[...S.catalog]; const row={type:c.type, name:x.name.trim(), result:x.result||"", evidence:x.evidence||""};
      if(isNew){ let at=-1; list.forEach((q,k)=>{ if(q.type===c.type) at=k; }); list.splice(at+1||list.length,0,row); } else list[i]=row;
      await write("config/catalog",{list}); toast("Đã lưu đầu việc chuẩn");
    },
    onDelete: isNew?null: async()=>{ if(!confirm("Xoá đầu việc chuẩn này? Các dự án đang dùng vẫn giữ tên đầu việc.")) return false; await write("config/catalog",{list:S.catalog.filter((_,k)=>k!==i)}); toast("Đã xoá"); }
  });
}


VIEW_RENDER.settings = viewSettings;
