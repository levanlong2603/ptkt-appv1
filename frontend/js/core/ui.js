"use strict";
/* Khung giao diện: menu, vẽ màn hình, thành phần dùng chung, form trượt (drawer) */
/* ================= shell ================= */
function renderNav(){
  const navBadge = id => { const fn = NAV_BADGE[id]; const n = fn ? fn() : 0; return n ? `<span class="nav-badge">${n>99?"99+":n}</span>` : ""; };
  document.getElementById("nav").innerHTML = VIEWS.map(v => v.sep ? '<div class="sep"></div>' :
    `<button data-view="${v.id}" ${S.view===v.id?'aria-current="page"':''} title="${esc(v.label)}">${ICONS[v.icon]}<span>${esc(v.label)}</span>${navBadge(v.id)}</button>`).join("");
  const ub = document.getElementById("userBox");
  if(S.user){ ub.hidden = false;
    const initials = S.user.display_name.trim().split(/\s+/).slice(-2).map(w=>w[0]).join("").toUpperCase();
    ub.innerHTML = `<div class="userbox-row"><div class="avatar">${esc(initials)}</div><div class="userbox-info"><b>${esc(S.user.display_name)}</b><span>${S.user.role==="admin"?"Trưởng phòng":"Nhân viên"}</span></div></div><div class="acts"><button data-uact="pw">Đổi mật khẩu</button><button data-uact="out">Đăng xuất</button></div>`; }
  const sel = document.getElementById("meSel");
  const isAdmin = !!(S.user && S.user.role==="admin");
  sel.disabled = !!(S.user && !isAdmin);
  const names = S.staff.map(s=>s.name);
  /* "Tất cả" chỉ dành cho trưởng phòng: xem gộp dữ liệu mọi người thay vì theo một cá nhân.
     Trưởng phòng không có lựa chọn "— chọn tên —" bỏ trống nữa — chưa chọn ai thì mặc định là "Tất cả". */
  if(isAdmin && !S.me){ S.me = "__all__"; store("me", S.me); }
  const allOpt = isAdmin ? `<option value="__all__" ${S.me==="__all__"?"selected":""}>— Tất cả —</option>` : '<option value="">— chọn tên —</option>';
  sel.innerHTML = allOpt + names.map(n=>`<option ${n===S.me?"selected":""}>${esc(n)}</option>`).join("");
}
document.getElementById("nav").addEventListener("click", e => { const b=e.target.closest("button[data-view]"); if(!b) return; S.view=b.dataset.view; store("view",S.view); render(); document.getElementById("main").scrollTop=0; });
document.getElementById("meSel").addEventListener("change", e => { S.me=e.target.value; store("me",S.me); render(); });

function render(){
  M = derive();
  renderNav();
  const main = document.getElementById("main");
  let html = "";
  const banner = S.conn==="off" ? `<div class="banner">Không kết nối được máy chủ. Kiểm tra mạng hoặc báo quản trị hệ thống.</div>` : "";
  if(S.conn==="on" && !S.loaded) html = `<div class="empty"><b>Đang tải dữ liệu…</b></div>`;
  else html = (VIEW_RENDER[S.view] || VIEW_RENDER.dash || (() => ""))();
  main.innerHTML = `<div class="page">${banner}${html}</div>`;
}


/* ================= shared pieces ================= */
/* Dải hạng mục: thay vì thanh tiến độ, mỗi ô hiện số cảnh báo (quá hạn/vướng/sắp hạn) của hạng mục đó,
   khớp với cột "Cảnh báo" trong bảng đầu việc, để nhìn dải là biết ngay hạng mục nào cần theo dõi.
   Mỗi ô là một nút: bấm vào sẽ mở dự án (nếu đang đóng) và mở đúng hạng mục đó trong bảng đầu việc bên
   dưới, đồng thời đóng các hạng mục khác lại (accordion) – scope/selVar phải khớp với tham số truyền cho
   planTreeRows() và biến state dùng để mở/đóng dự án ở trang gọi strip() (xem ACTIONS["stripgo"]). */
function strip(p, scope="plan", selVar="planSel"){
  if(!p._phases.length) return '<span class="muted small">–</span>';
  return `<div class="strip" role="img" aria-label="Cảnh báo theo giai đoạn">` + p._phases.map(ph => {
    const ts = p._tasks.filter(t=>t.phase===ph.code);
    const late = ts.filter(t=>t.warns.some(w=>w[1]==="Quá hạn")).length;
    const soon = ts.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn")).length;
    const stuck = ts.filter(t=>OPEN.has(t.status) && (t.status==="Đang vướng" || (t.ms||0)>=1)).length;
    /* Số hiện ở ô = tổng số pill Cảnh báo thực tế trong bảng đầu việc (t.warns), không phải đếm theo
       3 điều kiện riêng late/stuck/soon – vì 1 đầu việc có thể khớp nhiều điều kiện cùng lúc (vd vừa
       Quá hạn vừa "Đang vướng" nhưng ma sát <3, chưa đủ thành pill riêng) khiến số bị đếm trùng, lệch
       với số pill người dùng thực sự thấy trong bảng. */
    const n = ts.reduce((a,t)=>a+t.warns.length,0);
    const cls = !ts.length ? "none" : late ? "bad" : (stuck||soon) ? "warn" : "ok";
    const parts = [late&&`${late} quá hạn`, stuck&&`${stuck} vướng`, soon&&`${soon} sắp hạn`].filter(Boolean);
    const tip = `${ph.code}. ${ph.name}: ${!ts.length?"không có đầu việc":parts.length?parts.join(", "):"không có cảnh báo"}`;
    return `<button type="button" class="seg ${cls}" data-act="stripgo" data-pid="${esc(p.id)}" data-scope="${esc(scope)}" data-code="${esc(ph.code)}" data-selvar="${esc(selVar)}" title="${esc(tip)}"><b>${esc(ph.code)}</b>${n?`<span class="segn">${n}</span>`:""}</button>`;
  }).join("") + `</div>`;
}
/* Bấm 1 ô trong strip() → mở dự án đó (nếu đang đóng) và mở đúng hạng mục trong bảng đầu việc, đóng các
   hạng mục khác lại (accordion) trong cùng dự án. */
ACTIONS["stripgo"] = el => {
  const { pid, scope, code, selvar } = el.dataset;
  S[selvar] = pid;
  S.planTog = S.planTog || {};
  for(const k of Object.keys(S.planTog)) if(k.startsWith(scope+"|grp:")) delete S.planTog[k];
  S.planTog[scope+"|grp:"+code] = true;
  render();
};
function stPill(st){
  const c = {"Hoàn thành":"ok","Đang làm":"info","Đang vướng":"bad","Tạm dừng":"mute","Hủy":"mute","Chưa bắt đầu":"mute"}[st]||"mute";
  return `<span class="pill ${c}">${esc(st||"–")}</span>`;
}
function warnPills(ws){ return ws.map(w=>`<span class="pill ${w[0]}">${esc(w[1])}</span>`).join(" "); }
function weekNav(){
  const w=S.week, isNow = w===mondayOf(todayISO());
  return `<div class="toolbar"><div class="weeknav">
    <button class="btn ghost icon" data-act="wk" data-d="-7" aria-label="Tuần trước">‹</button>
    <div class="lbl">Tuần ${isoWeek(w)}<small>${dm(w)} – ${dmy(addDays(w,6))}</small></div>
    <button class="btn ghost icon" data-act="wk" data-d="7" aria-label="Tuần sau">›</button></div>
    ${isNow?"":'<button class="btn" data-act="wk" data-d="0">Tuần này</button>'}</div>`;
}
function typeDot(t){ return `<span class="tdot" style="background:${TYPE_COLOR[t]||"var(--grey)"}"></span>`; }



/* ================= form drawer ================= */
function openForm(cfg){
  const layer = document.getElementById("layer");
  const vals = {...cfg.values};
  const prevFocus = document.activeElement;
  const optsOverride = {};
  const fieldHTML = f => {
    if(f.heading) return `<h3 style="margin:22px 0 12px; padding-top:14px; border-top:1px solid var(--line)">${esc(f.heading)}</h3>`;
    const id = "f_"+f.key, v = vals[f.key];
    const hint = typeof f.hint==="function" ? f.hint(v, vals) : (f.hint||"");
    let ctl = "";
    const dis = f.disabled ? "disabled" : "";
    if(f.type==="text"||f.type==="number"||f.type==="password") ctl = `<input class="inp" id="${id}" type="${f.type==="number"?"number":f.type==="password"?"password":"text"}" ${f.type==="password"?'autocomplete="new-password"':""} value="${esc(v??"")}" ${f.required?"required":""} ${dis}>`;
    else if(f.type==="date") ctl = `<input class="inp" id="${id}" type="date" value="${esc(v||"")}" ${dis}>`;
    else if(f.type==="textarea") ctl = `<textarea class="inp" id="${id}" ${dis}>${esc(v||"")}</textarea>`;
    else if(f.type==="check") ctl = `<label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--ink)"><input type="checkbox" id="${id}" ${v?"checked":""} ${dis}> ${esc(f.label)}</label>`;
    else if(f.type==="select"){
      /* options: mảng [giá trị, nhãn], hoặc {group:"Tên nhóm", options:[[giá trị, nhãn], …]} để gom theo nhóm */
      const opts = optsOverride[f.key] || f.options;
      const optHTML = o => `<option value="${esc(o[0]??"")}" ${String(o[0]??"")===String(v??"")?"selected":""}>${esc(o[1])}</option>`;
      const hasPlaceholder = opts.some(o=>!o.group && (o[0]===""||o[0]==null));
      const body = opts.map(o => o.group ? `<optgroup label="${esc(o.group)}">${o.options.map(optHTML).join("")}</optgroup>` : optHTML(o)).join("");
      ctl = `<select class="inp" id="${id}" ${dis}>${hasPlaceholder?"":'<option value="">— chọn —</option>'}${body}</select>`;
    }
    else if(f.type==="seg") ctl = `<div class="seg-in" role="group" aria-label="${esc(f.label)}">${f.options.map(o=>`<button type="button" data-k="${f.key}" data-v="${esc(JSON.stringify(o[0]))}" aria-pressed="${JSON.stringify(o[0]??null)===JSON.stringify(v??null)}" ${f.disabled?"disabled":""}>${esc(o[1])}</button>`).join("")}</div>`;
    return `<div class="field" ${f.half?'data-half="1"':""} data-field="${f.key}">${f.type==="check"?"":`<label for="${id}">${esc(f.label)}${f.required?' <span style="color:var(--bad)">*</span>':""}</label>`}${ctl}${hint!==""?`<div class="hint" data-hint="${f.key}">${esc(hint)}</div>`:`<div class="hint" data-hint="${f.key}"></div>`}</div>`;
  };
  const body = () => {
    let out = cfg.info || ""; let buf = [];
    const flush = () => { if(buf.length){ out += buf.length===2 ? `<div class="row2">${buf.join("")}</div>` : buf.join(""); buf=[]; } };
    for(const f of cfg.fields){ const h = fieldHTML(f); if(f.half){ buf.push(h); if(buf.length===2) flush(); } else { flush(); out += h; } }
    flush(); return out;
  };
  layer.innerHTML = `<div class="scrim" data-close></div><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="dlgT">
    <div class="drawer-h"><div><h2 id="dlgT">${esc(cfg.title)}</h2>${cfg.subtitle?`<div class="small muted" style="margin-top:3px">${esc(cfg.subtitle)}</div>`:""}</div><button class="btn ghost icon" data-close aria-label="Đóng">✕</button></div>
    <div class="drawer-b" id="dlgB">${body()}</div>
    <div class="drawer-f"><div>${cfg.onDelete?'<button class="btn danger" data-del>Xoá</button>':""}</div><div class="toolbar"><button class="btn" data-close>${cfg.readOnly?"Đóng":"Huỷ"}</button>${cfg.readOnly?"":`<button class="btn primary" data-save>${esc(cfg.saveLabel||"Lưu")}</button>`}</div></div></div>`;
  const dlg = layer.querySelector(".drawer");
  const api = { setOptions(key, opts){ optsOverride[key]=opts; vals[key]=""; const f = cfg.fields.find(x=>x.key===key); const wrap = dlg.querySelector(`[data-field="${key}"]`); if(f && wrap){ const tmp=document.createElement("div"); tmp.innerHTML=fieldHTML(f); wrap.replaceWith(tmp.firstElementChild); } } };
  const readInputs = () => { for(const f of cfg.fields){ if(!f.key) continue; const el = dlg.querySelector("#f_"+f.key); if(!el) continue; if(f.type==="check") vals[f.key]=el.checked; else if(f.type==="number") vals[f.key]=el.value===""?null:+el.value; else if(f.type!=="seg") vals[f.key]=el.value||(f.type==="date"?null:""); } };
  const close = () => { layer.innerHTML=""; document.removeEventListener("keydown", onKey); if(prevFocus && prevFocus.focus) prevFocus.focus(); };
  const onKey = e => { if(e.key==="Escape") close(); };
  document.addEventListener("keydown", onKey);
  dlg.addEventListener("click", async e => {
    const sb = e.target.closest(".seg-in button");
    if(sb){ const k=sb.dataset.k; const v=JSON.parse(sb.dataset.v); vals[k]=v; sb.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed", b===sb)); const f=cfg.fields.find(x=>x.key===k); const hn=dlg.querySelector(`[data-hint="${k}"]`); if(f && hn && typeof f.hint==="function") hn.textContent=f.hint(v, vals); return; }
    if(e.target.closest("[data-save]")){
      readInputs();
      for(const f of cfg.fields){ if(f.required && (vals[f.key]==null || vals[f.key]==="")){ toast("Còn thiếu: "+f.label); return; } }
      const btn = e.target.closest("[data-save]"); btn.disabled=true;
      try{ await cfg.onSave(vals); close(); }catch(err){ btn.disabled=false; if(err && err.message) toast(err.message); }
      return;
    }
    if(e.target.closest("[data-del]")){ try{ const r = await cfg.onDelete(); if(r!==false) close(); }catch(err){} return; }
  });
  dlg.addEventListener("change", e => {
    const el = e.target; if(!el.id || !el.id.startsWith("f_")) return;
    const key = el.id.slice(2); const f = cfg.fields.find(x=>x.key===key); readInputs();
    if(f && f.onChange) f.onChange(vals[key], api);
    const hn = dlg.querySelector(`[data-hint="${key}"]`); if(f && hn && typeof f.hint==="function") hn.textContent=f.hint(vals[key], vals);
    cfg.fields.forEach(g=>{ if(typeof g.hint==="function"){ const h2=dlg.querySelector(`[data-hint="${g.key}"]`); if(h2) h2.textContent=g.hint(vals[g.key], vals); } });
  });
  layer.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", close));
  setTimeout(()=>{ const first = dlg.querySelector("input,select,textarea,.seg-in button"); (first||dlg.querySelector("[data-close]")).focus(); }, 30);
}
