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
    <div class="data-ico" style="background:var(--teal-soft); color:var(--teal)">${icoDb}</div>
    <div style="flex:1; min-width:160px"><div class="data-t">Sao lưu &amp; khôi phục</div><div class="small muted">Dữ liệu phòng ban</div></div>
    ${S.canEdit?`<div class="toolbar">
      <button class="btn primary" data-act="exp-json" title="Tải toàn bộ dữ liệu hiện tại về máy">${icoDownload} Backup</button>
      <button class="btn" data-act="imp-json" title="Khôi phục từ file backup — THAY TOÀN BỘ dữ liệu hiện tại cho cả phòng">${icoUpload} Restore</button>
      <input type="file" accept=".json,application/json" id="impFile" hidden></div>`:""}
    </div></section>`;
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Nhân sự & capacity</h2>${ro?"":'<button class="btn primary" data-act="addstaff">+ Nhân sự</button>'}</div>
    <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:24%">Họ tên</th><th style="width:13%; text-align:center">Giờ / tuần</th><th style="width:15%; text-align:center">% trừ họp, phát sinh</th><th style="width:14%; text-align:center">Kinh nghiệm (năm)</th><th style="width:16%; text-align:center">Hệ số năng lực</th><th style="width:18%; text-align:center">Capacity (điểm/tuần)</th></tr></thead><tbody>
    ${M.staff.map((s,i)=>`<tr class="${ro?"":"click"}" data-act="${ro?"":"editstaff"}" data-i="${i}" tabindex="0"><td class="cell-main">${esc(s.name)}${s.title?`<div class="small muted">${esc(s.title)}</div>`:""}</td><td style="text-align:center">${s.hours}</td><td style="text-align:center">${Math.round(s.pct*100)}%</td><td style="text-align:center">${s.years||"–"}</td><td style="text-align:center">${fmt1(s.factor)}</td><td style="text-align:center; font-weight:600">${fmt1(s.cap)}</td></tr>`).join("")||'<tr><td colspan="6" class="muted">Chưa có nhân sự.</td></tr>'}
    </tbody></table></div><div class="panel-b small muted">Capacity = Giờ/tuần × (1 − % họp, phát sinh) × Hệ số năng lực. Hệ số năng lực theo kinh nghiệm (gợi ý, trưởng phòng tự chọn): &lt;1 năm → 0,8 · 1–3 năm → 1,0 · 3–5 năm → 1,1 · 5–8 năm → 1,2 · &gt;8 năm → 1,3.</div></section>`;
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
  const isNew = i==null; const s = isNew ? {name:"", title:"", hours:40, pct:0.2, factor:1.0, years:0} : {...S.staff[i]};
  const factorHint = (val,vals) => {
    const y = +vals.years||0;
    const sug = y<1?0.8:y<3?1:y<5?1.1:y<8?1.2:1.3;
    return `Gợi ý theo ${y||0} năm kinh nghiệm: ${fmt1(sug)}`;
  };
  openForm({title:isNew?"Thêm nhân sự":"Sửa nhân sự", values:{...s, pctV:Math.round(s.pct*100)},
    fields:[{key:"name", label:"Họ tên", type:"text", required:true},
      {key:"title", label:"Chức danh (chỉ để tham khảo, dùng cho KPI & Năng lực)", type:"text", hint:()=>"Vd: Network Engineer, Security Engineer…"},
      {key:"hours", label:"Giờ làm / tuần", type:"number", half:true}, {key:"pctV", label:"% trừ họp, phát sinh", type:"number", half:true, hint:()=>"Khuyến nghị 15–25"},
      {key:"years", label:"Số năm kinh nghiệm (chỉ để tham khảo)", type:"number", half:true, hint:()=>"Dùng để gợi ý hệ số năng lực bên cạnh"},
      {key:"factor", label:"Hệ số năng lực", type:"seg", options:[[0.8,"0,8"],[1,"1,0"],[1.1,"1,1"],[1.2,"1,2"],[1.3,"1,3"]], half:true, hint:factorHint}],
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập họ tên.");
      const list=[...S.staff]; const row={name:x.name.trim(), title:x.title||"", hours:+x.hours||40, pct:(+x.pctV||0)/100, factor:+x.factor||1, years:+x.years||0};
      if(isNew) list.push(row); else list[i]=row;
      await write("config/staff",{list}); toast("Đã lưu nhân sự");
    },
    onDelete: isNew?null: async()=>{ if(!confirm("Xoá nhân sự này?")) return false; const list=S.staff.filter((_,k)=>k!==i); await write("config/staff",{list}); toast("Đã xoá"); }
  });
}
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
