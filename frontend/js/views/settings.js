"use strict";
/* Màn hình: settings */
/* ================= VIEW: settings ================= */
function viewSettings(){
  const ro = !S.canEdit;
  let h = `<div class="head"><div><h1>Cài đặt</h1><div class="sub">Nhân sự & capacity, đầu việc chuẩn theo quy trình${ro?" · chỉ trưởng phòng được sửa":""}</div></div></div>`;
  h += usersPanel();
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Dữ liệu</h2><span class="muted small">lưu trên máy chủ của phòng</span></div>
    <div class="panel-b"><div class="toolbar" style="margin-bottom:10px">
      <button class="btn" data-act="exp-plan">Xuất Excel: kế hoạch dự án</button>
      <button class="btn" data-act="exp-week">Xuất Excel: nhập theo tuần</button>
      ${S.canEdit?`<button class="btn primary" data-act="exp-json">Tải file sao lưu (.json)</button><button class="btn" data-act="imp-json">Khôi phục từ file sao lưu…</button><input type="file" accept=".json,application/json" id="impFile" hidden>`:""}</div>
      <div class="small muted">Máy chủ tự sao lưu hằng ngày. ${S.canEdit?"Khôi phục từ file sao lưu sẽ THAY TOÀN BỘ dữ liệu hiện tại cho cả phòng.":""}</div></div></section>`;
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Nhân sự & capacity</h2>${ro?"":'<button class="btn primary" data-act="addstaff">+ Nhân sự</button>'}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Họ tên</th><th class="num">Giờ / tuần</th><th class="num">% trừ họp, phát sinh</th><th class="num">Hệ số năng lực</th><th class="num">Capacity (điểm/tuần)</th></tr></thead><tbody>
    ${M.staff.map((s,i)=>`<tr class="${ro?"":"click"}" data-act="${ro?"":"editstaff"}" data-i="${i}" tabindex="0"><td class="cell-main">${esc(s.name)}</td><td class="num">${s.hours}</td><td class="num">${Math.round(s.pct*100)}%</td><td class="num">${fmt1(s.factor)}</td><td class="num" style="font-weight:600">${fmt1(s.cap)}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">Chưa có nhân sự.</td></tr>'}
    </tbody></table></div><div class="panel-b small muted">Capacity = Giờ/tuần × (1 − % họp, phát sinh) × Hệ số năng lực. Hệ số: 0,8 đang học việc · 1,0 phù hợp · 1,2 chuyên gia (không phải điểm đánh giá).</div></section>`;
  for(const t of TYPES){
    const list = S.catalog.map((c,i)=>({...c,i})).filter(c=>c.type===t);
    h += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>${typeDot(t)}Quy trình ${t.toLowerCase()} <span class="muted small">· ${list.length} đầu việc chuẩn</span></h2>${ro?"":`<button class="btn" data-act="addcat" data-t="${t}">+ Đầu việc chuẩn</button>`}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Đầu việc</th><th class="num">Quy mô</th><th class="num">Độ phức tạp</th><th class="num">Workload</th><th>Kết quả cần đạt</th><th>Minh chứng</th></tr></thead><tbody>
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
    out += planGroupRow(key, 0, (g.code?g.code+". ":"")+(g.name||"Khác"), {meta:`${g.items.length} đầu việc chuẩn`}, open, "", 6);
    if(!open) continue;
    for(const c of g.items) out += `<tr class="${ro?"":"click"}" data-act="${ro?"":"editcat"}" data-i="${c.i}" tabindex="0"><td class="cell-main">${esc(c.name)}</td><td class="num">${c.qm??"–"}</td><td class="num">${c.pt??"–"}</td><td class="num">${c.qm&&c.pt?c.qm*c.pt:"–"}</td><td class="small">${esc(c.result||"")}</td><td class="small">${esc(c.evidence||"")}</td></tr>`;
  }
  return out;
}
function staffForm(i){
  const isNew = i==null; const s = isNew ? {name:"", hours:40, pct:0.2, factor:1.0} : {...S.staff[i]};
  openForm({title:isNew?"Thêm nhân sự":"Sửa nhân sự", values:{...s, pctV:Math.round(s.pct*100)},
    fields:[{key:"name", label:"Họ tên", type:"text", required:true},
      {key:"hours", label:"Giờ làm / tuần", type:"number", half:true}, {key:"pctV", label:"% trừ họp, phát sinh", type:"number", half:true, hint:()=>"Khuyến nghị 15–25"},
      {key:"factor", label:"Hệ số năng lực", type:"seg", options:[[0.8,"0,8"],[1,"1,0"],[1.2,"1,2"]]}],
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập họ tên.");
      const list=[...S.staff]; const row={name:x.name.trim(), hours:+x.hours||40, pct:(+x.pctV||0)/100, factor:+x.factor||1};
      if(isNew) list.push(row); else list[i]=row;
      await write("config/staff",{list}); toast("Đã lưu nhân sự");
    },
    onDelete: isNew?null: async()=>{ if(!confirm("Xoá nhân sự này?")) return false; const list=S.staff.filter((_,k)=>k!==i); await write("config/staff",{list}); toast("Đã xoá"); }
  });
}
function catForm(i, type){
  const isNew = i==null; const c = isNew ? {type, name:"", qm:null, pt:null, result:"", evidence:""} : {...S.catalog[i]};
  openForm({title:isNew?"Thêm đầu việc chuẩn":"Sửa đầu việc chuẩn", subtitle:"Quy trình "+c.type.toLowerCase(), values:c,
    fields:[{key:"name", label:"Tên đầu việc", type:"text", required:true, hint:()=>"Giữ mã giai đoạn ở đầu tên, ví dụ “05. Thiết kế – LLD”, “T3. Hồ sơ kỹ thuật – …”."},
      {key:"qm", label:"Quy mô chuẩn", type:"seg", options:[[null,"–"],...[1,2,3,4,5].map(n=>[n,String(n)])]},
      {key:"pt", label:"Độ phức tạp chuẩn", type:"seg", options:[[null,"–"],...[1,2,3,4,5].map(n=>[n,String(n)])]},
      {key:"result", label:"Kết quả cần đạt", type:"textarea"}, {key:"evidence", label:"Minh chứng", type:"text"}],
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập tên đầu việc.");
      const list=[...S.catalog]; const row={type:c.type, name:x.name.trim(), qm:x.qm||null, pt:x.pt||null, result:x.result||"", evidence:x.evidence||""};
      if(isNew){ let at=-1; list.forEach((q,k)=>{ if(q.type===c.type) at=k; }); list.splice(at+1||list.length,0,row); } else list[i]=row;
      await write("config/catalog",{list}); toast("Đã lưu đầu việc chuẩn");
    },
    onDelete: isNew?null: async()=>{ if(!confirm("Xoá đầu việc chuẩn này? Các dự án đang dùng vẫn giữ tên đầu việc.")) return false; await write("config/catalog",{list:S.catalog.filter((_,k)=>k!==i)}); toast("Đã xoá"); }
  });
}


VIEW_RENDER.settings = viewSettings;
