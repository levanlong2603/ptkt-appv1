"use strict";
/* Khung giao diện: header, menu, vẽ màn hình, thành phần dùng chung, form trượt (drawer) */
/* ================= shell ================= */
function avatarInitials(name){ return (name||"").trim().split(/\s+/).slice(-2).map(w=>w[0]).join("").toUpperCase(); }
function renderNav(){
  const navBadge = id => { const fn = NAV_BADGE[id]; const n = fn ? fn() : 0; return n ? `<span class="nav-badge">${n>99?"99+":n}</span>` : ""; };
  const btn = v => v.id==="kpi" && S.user?.role!=="admin" ? "" : `<button data-view="${v.id}" ${S.view===v.id?'aria-current="page"':''} title="${esc(v.label)}">${ICONS[v.icon]}<span>${esc(v.label)}</span>${navBadge(v.id)}</button>`;
  /* Gom theo nhóm có tiêu đề nhỏ (vd "DASHBOARD & QUẢN LÝ" / "CÀI ĐẶT"): nhóm đầu tiên trước dấu {sep:true}
     đầu tiên trong VIEWS, nhóm sau là phần còn lại. Chỉ đổi cách hiển thị, không đổi danh sách/route màn hình. */
  const sepI = VIEWS.findIndex(v=>v.sep);
  const group1 = sepI<0 ? VIEWS : VIEWS.slice(0,sepI), group2 = sepI<0 ? [] : VIEWS.slice(sepI+1);
  document.getElementById("nav").innerHTML =
    `<div class="nav-grp" title="Dashboard &amp; Quản lý"><span class="full">Dashboard &amp; Quản lý</span><span class="ab" aria-hidden="true">D</span></div>${group1.map(btn).join("")}` +
    (group2.length ? `<div class="nav-grp" title="Cài đặt"><span class="full">Cài đặt</span><span class="ab" aria-hidden="true">C</span></div>${group2.map(btn).join("")}` : "");
  const ub = document.getElementById("userBox");
  if(S.user){ ub.hidden = false;
    const initials = avatarInitials(S.user.display_name);
    ub.innerHTML = `<div class="userbox-row"><div class="avatar">${esc(initials)}</div><div class="userbox-info"><b>${esc(S.user.display_name)}</b><span>${esc(ROLE_LABEL[S.user.role]||"Nhân viên")}</span></div></div><div class="acts"><button data-uact="out">${ICONS.logout}Đăng xuất</button></div>`; }
  const sel = document.getElementById("meSel");
  const isAdmin = !!(S.user && S.canEdit);
  sel.disabled = !!(S.user && !isAdmin);
  const names = S.staff.map(s=>s.name);
  /* "Tất cả" chỉ dành cho trưởng phòng: xem gộp dữ liệu mọi người thay vì theo một cá nhân.
     Trưởng phòng không có lựa chọn "— chọn tên —" bỏ trống nữa — chưa chọn ai thì mặc định là "Tất cả". */
  if(isAdmin && !S.me){ S.me = "__all__"; store("me", S.me); }
  const allOpt = isAdmin ? `<option value="__all__" ${S.me==="__all__"?"selected":""}>— Tất cả —</option>` : '<option value="">— chọn tên —</option>';
  sel.innerHTML = allOpt + names.map(n=>`<option ${n===S.me?"selected":""}>${esc(n)}</option>`).join("");
}
document.getElementById("nav").addEventListener("click", e => { const b=e.target.closest("button[data-view]"); if(!b) return; S.view=b.dataset.view; S.openProject=null; store("view",S.view); render(); document.getElementById("main").scrollTop=0; });
document.getElementById("meSel").addEventListener("change", e => {
  S.me=e.target.value; store("me",S.me);
  if(S.rp){
    S.rp.wkStaff = (S.me && S.me!=="__all__") ? S.me : "__all__";
    S.rp.meSource = S.me;
  }
  render();
});

/* ================= sidebar thu gọn/phóng to ================= */
const sideToggleBtn = document.getElementById("sideToggle");
sideToggleBtn.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg>');
/* Thu gọn chỉ có ý nghĩa ở bố cục máy tính; ở điện thoại menu là ngăn kéo nên luôn bỏ lớp side-collapsed (để nhãn
   hiện đủ), trở lại máy tính thì áp lại theo lựa chọn đã lưu */
const mobileMQ = window.matchMedia("(max-width:860px)");
const applyCollapsed = () => { document.body.classList.toggle("side-collapsed", !mobileMQ.matches && store("sideCollapsed")==="1"); };
applyCollapsed();
const syncSideToggleLabel = () => { const on = document.body.classList.contains("side-collapsed"); const label = on?"Mở rộng menu":"Thu gọn menu"; sideToggleBtn.setAttribute("aria-label", label); sideToggleBtn.title = label; };
syncSideToggleLabel();
/* Ngăn kéo menu ở điện thoại */
const tbMenu = document.getElementById("tbMenu");
tbMenu.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>');
const setNavOpen = on => { document.body.classList.toggle("nav-open", on); tbMenu.setAttribute("aria-expanded", on ? "true" : "false"); tbMenu.setAttribute("aria-label", on ? "Đóng menu" : "Mở menu"); };
tbMenu.addEventListener("click", e => { e.stopPropagation(); setNavOpen(!document.body.classList.contains("nav-open")); });
document.getElementById("navScrim").addEventListener("click", () => setNavOpen(false));
document.addEventListener("keydown", e => { if(e.key==="Escape" && document.body.classList.contains("nav-open")) setNavOpen(false); });
document.getElementById("nav").addEventListener("click", e => { if(e.target.closest("button[data-view]")) setNavOpen(false); });
mobileMQ.addEventListener("change", () => { setNavOpen(false); applyCollapsed(); syncSideToggleLabel(); });
sideToggleBtn.addEventListener("click", () => {
  const on = document.body.classList.toggle("side-collapsed");
  store("sideCollapsed", on?"1":"0");
  syncSideToggleLabel();
});

/* ================= header (topbar) ================= */
/* Icon chỉ cần chèn 1 lần lúc khởi động (không phải mỗi lần render) vì không đổi theo dữ liệu */
document.getElementById("tbApps").insertAdjacentHTML("afterbegin", ICONS.grid);
document.getElementById("tbBell").insertAdjacentHTML("afterbegin", ICONS.bell);
document.querySelector("#tbAccount .tb-chev").outerHTML = ICONS.chevronDown.replace("<svg ", '<svg class="tb-chev" ');

function tbCloseAll(except){
  for(const id of ["tbAppsMenu","tbBellMenu","tbAccountMenu"]){
    if(id===except) continue;
    const m = document.getElementById(id); m.hidden = true;
    document.getElementById(id.replace("Menu","")).setAttribute("aria-expanded","false");
  }
}
function tbToggle(btnId, menuId){
  const btn = document.getElementById(btnId), menu = document.getElementById(menuId);
  const opening = menu.hidden;
  tbCloseAll(opening?menuId:null);
  menu.hidden = !opening; btn.setAttribute("aria-expanded", String(opening));
}
document.getElementById("tbApps").addEventListener("click", e => { e.stopPropagation(); tbToggle("tbApps","tbAppsMenu"); });
document.getElementById("tbBell").addEventListener("click", e => { e.stopPropagation(); tbToggle("tbBell","tbBellMenu"); });
document.getElementById("tbAccount").addEventListener("click", e => { e.stopPropagation(); tbToggle("tbAccount","tbAccountMenu"); });
document.getElementById("tbAccountMenu").addEventListener("click", e => {
  const th = e.target.closest("[data-theme-set]");
  if(th){ setTheme(th.dataset.themeSet); return; }
  const b = e.target.closest("[data-uact]"); if(!b) return;
  tbCloseAll(); const a = b.dataset.uact;
  if(a==="pw") passwordForm(); else if(a==="tg") tgOpen(); else if(a==="tgsched") tgScheduleForm(); else if(a==="out") logout();
});
/* Giao diện: "light"/"dark" ép màu, "system" gỡ data-theme để CSS tự theo prefers-color-scheme.
   index.html đã gắn data-theme="light" ngay khi tải trang (đọc localStorage) để không bị chớp màu. */
function currentTheme(){ const t = store("theme"); return (t==="dark"||t==="system") ? t : "light"; }
function setTheme(t){
  if(t==="light"||t==="dark") document.documentElement.dataset.theme = t; else document.documentElement.removeAttribute("data-theme");
  store("theme", t); renderHeader();
}
document.getElementById("tbBellMenu").addEventListener("click", e => {
  const be = e.target.closest("[data-tbgo-event]");
  if(be){ // mở tab Lịch đúng tuần của sự kiện
    const ev = (S.events||[]).find(x=>x.id===be.dataset.tbgoEvent);
    tbCloseAll(); S.view = "input"; S.weekTab = "calendar"; if(ev) S.week = mondayOf(ev.start.slice(0,10)); store("view", S.view); render();
    return;
  }
  const bi = e.target.closest("[data-tbgo-issue]");
  if(bi){
    const [id, person] = bi.dataset.tbgoIssue.split("|");
    /* Mở thẳng Nhập theo tuần, đúng người + đúng tuần của lượt nhập đó, rồi mở luôn form sửa dòng này –
       để vào ghi chú/hướng xử lý ngay (ô "Vướng mắc / cần ai hỗ trợ"), không chỉ xem danh sách rồi tự
       tìm. Đổi cả "Tôi là" sang đúng người đó (giống cách trưởng phòng/phó phòng vẫn làm khi sửa dữ liệu
       tuần người khác) để entryForm() mở được. */
    const w = mondayOf(todayISO());
    tbCloseAll(); S.view = "input"; S.weekTab = "tasks"; S.week = w; S.me = person; store("view", S.view); store("me", S.me); render();
    const doc = weekDoc(w, person); const en = doc && (doc.entries||[]).find(x=>x.id===id);
    if(en) entryForm(en, person);
    return;
  }
  const b = e.target.closest("[data-tbgo]"); if(!b) return;
  tbCloseAll(); S.view = b.dataset.tbgo; store("view", S.view); render();
});
document.addEventListener("click", () => tbCloseAll());
document.addEventListener("keydown", e => { if(e.key==="Escape") tbCloseAll(); });

function renderHeader(){
  if(S.user){
    document.getElementById("tbAvatar").textContent = avatarInitials(S.user.display_name);
    document.getElementById("tbName").textContent = S.user.display_name;
  }
  /* Danh sách liên kết nhanh (nút lưới ở thanh đầu trang): mở trong thẻ mới, rel=noopener để trang đích không điều khiển được ứng dụng */
  const APP_LINKS = [
    {label:"Cổng thông tin", href:"https://www.ngsi.com.vn/", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9z"/></svg>'},
    {label:"Facebook", href:"https://www.facebook.com/profile.php?id=100056785749445", icon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.5-3h-3.1V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.7V21h3z"/></svg>'}
  ];
  document.getElementById("tbAppsMenu").innerHTML = `<div class="tb-head">Danh sách chức năng (${APP_LINKS.length})</div>
    <div class="tb-apps">${APP_LINKS.map(a=>`<a class="tb-app" href="${a.href}" target="_blank" rel="noopener noreferrer"><span class="tb-app-ico">${a.icon}</span><span>${esc(a.label)}</span></a>`).join("")}</div>`;
  const th = currentTheme();
  document.getElementById("tbAccountMenu").innerHTML = S.user ? `
    <div class="tb-head">Giao diện</div>
    <div class="seg-in" role="group" aria-label="Giao diện" style="margin:0 10px 6px">
      <button type="button" data-theme-set="light" aria-pressed="${th==="light"}">Sáng</button>
      <button type="button" data-theme-set="dark" aria-pressed="${th==="dark"}">Tối</button>
      <button type="button" data-theme-set="system" aria-pressed="${th==="system"}">Hệ thống</button>
    </div>
    <div class="tb-sep"></div>
    <button class="tb-item" data-uact="pw">Đổi mật khẩu</button>
    <button class="tb-item" data-uact="tg">Liên kết Telegram</button>
    ${S.canEdit?'<button class="tb-item" data-uact="tgsched">Lịch tự động Telegram</button>':""}
    <button class="tb-item" data-uact="out">Đăng xuất</button>` : "";
  /* Chuông thông báo: CHỈ còn đúng 1 nội dung – vướng mắc nhập trong "Nhập theo tuần" của tuần hiện tại
     (weekIssues() ở model.js, nguồn trực tiếp từ lượt nhập tuần, không lấy theo dữ liệu đã tổng hợp ở
     Kế hoạch dự án/Tổng quan dự án). Đã bỏ hẳn các mục cũ (đầu việc quá hạn, góp ý chưa xem). */
  const issues = (S.loaded && M) ? weekIssues() : [];
  /* + Sự kiện lịch sắp bắt đầu trong 30 phút (calUpcoming() ở modules/calendar.js, nạp sau nên kiểm tra tồn tại) */
  const ups = (S.loaded && typeof calUpcoming==="function") ? calUpcoming() : [];
  const bellN = document.getElementById("tbBellN"), total = issues.length + ups.length;
  bellN.hidden = !total; bellN.textContent = total>99?"99+":total;
  const TB_BELL_MAX = 8;
  const rows = [];
  if(ups.length){
    rows.push(`<div class="tb-head">Sự kiện sắp diễn ra</div>`);
    for(const x of ups) rows.push(`<button class="tb-item" type="button" data-tbgo-event="${esc(x.e.id)}">
      <b><span class="pill info" style="margin-right:5px">${esc(calLeftText(x.inMin))}</span>${esc(x.e.title)}</b>
      <span class="muted">${esc(x.e.start.slice(11))}–${esc(x.e.end.slice(11))}${x.e.place?" · "+esc(x.e.place):""}${x.e.person===""?" · Cả phòng":""}</span></button>`);
    if(issues.length) rows.push(`<div class="tb-head">Vướng mắc trong tuần</div>`);
  }
  for(const e of issues.slice(0, TB_BELL_MAX)){
    const t = e.ref.t, p = e.ref.p;
    rows.push(`<button class="tb-item" type="button" data-tbgo-issue="${esc(e.id)}|${esc(e.person)}">
      <b><span class="pill ${e.ms>=3?"bad":"warn"}" style="margin-right:5px">Ma sát ${e.ms}</span>${esc(planShortName(t.dv))}</b>
      <span class="muted">${esc(p.name)}${e.nn?" · "+esc(e.nn):""} · ${esc(e.person)}</span></button>`);
  }
  if(issues.length>TB_BELL_MAX) rows.push(`<button class="tb-item" type="button" data-tbgo="input"><b>Xem tất cả ${issues.length} vướng mắc →</b></button>`);
  document.getElementById("tbBellMenu").innerHTML = rows.length ? rows.join("") : `<div class="tb-empty">Không có thông báo nào</div>`;
}

function render(){
  if(S.view==="help"){ S.view="exec"; store("view",S.view); }
  M = derive();
  renderNav();
  renderHeader();
  const main = document.getElementById("main");
  let html = "";
  const banner = S.conn==="off" ? `<div class="banner">Không kết nối được máy chủ. Kiểm tra mạng hoặc báo quản trị hệ thống.</div>` : "";
  if(S.conn==="on" && !S.loaded) html = `<div class="empty"><b>Đang tải dữ liệu…</b></div>`;
  else html = (VIEW_RENDER[S.view] || VIEW_RENDER.dash || (() => ""))();
  /* Chân trang cuối nội dung (cuộn cùng trang): tên đơn vị + năm + phiên bản ứng dụng */
  main.innerHTML = `<div class="page">${banner}${html}</div><footer class="app-foot"><div>NextGen Service Integration</div><div>© 2026 NGSI - Version 1</div></footer>`;
}


/* ================= shared pieces ================= */
/* Dải hạng mục: thay vì thanh tiến độ, mỗi ô hiện số cảnh báo (quá hạn/vướng/sắp hạn) của hạng mục đó,
   khớp với cột "Cảnh báo" trong bảng đầu việc, để nhìn dải là biết ngay hạng mục nào cần theo dõi.
   Mỗi ô là một nút: bấm vào sẽ mở dự án đó – selVar là biến state mà trang gọi strip() dùng để mở dự án
   ("planSel": xổ bảng tại chỗ ở tab Kế hoạch dự án; "openProject": mở trang riêng của dự án từ tab Tổng
   quan – xem ACTIONS["stripgo"]). */
function strip(p, selVar="planSel"){
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
    return `<button type="button" class="seg ${cls}" data-act="stripgo" data-pid="${esc(p.id)}" data-selvar="${esc(selVar)}" title="${esc(tip)}"><b>${esc(ph.code)}</b>${n?`<span class="segn">${n}</span>`:""}</button>`;
  }).join("") + `</div>`;
}
/* Bấm 1 ô trong strip() → mở dự án đó (bảng đầu việc giờ hiện phẳng, không còn hạng mục nào để mở riêng). */
ACTIONS["stripgo"] = el => {
  const { pid, selvar } = el.dataset;
  S[selvar] = pid;
  render();
  if(selvar==="openProject") document.getElementById("main").scrollTop = 0;
};
function stPill(st){
  const c = {"Hoàn thành":"ok","Đang làm":"info","Đang vướng":"bad","Tạm dừng":"mute","Hủy":"mute","Chưa bắt đầu":"mute"}[st]||"mute";
  return `<span class="pill ${c}">${esc(st||"–")}</span>`;
}
function warnPills(ws){ return ws.map(w=>`<span class="pill ${w[0]}">${esc(w[1])}</span>`).join(" "); }
function weekNav(){
  const w=S.week, isNow = w===mondayOf(todayISO());
  return `<div class="toolbar"><div class="weeknav">
    <button data-act="wk" data-d="-7" aria-label="Tuần trước">‹</button>
    <div class="lbl">Tuần ${isoWeek(w)} · ${dm(w)} – ${dmy(addDays(w,6))}</div>
    <button data-act="wk" data-d="7" aria-label="Tuần sau">›</button></div>
    ${isNow?"":'<button class="btn" data-act="wk" data-d="0">Tuần này</button>'}</div>`;
}
function typeDot(t){ return `<span class="tdot" style="background:${TYPE_COLOR[t]||"var(--grey)"}"></span>`; }
/* "Cá nhân"/"Tổng thể": dùng chung cho Dashboard/Tổng quan dự án/Tải tuần – những trang trước đây nhân
   viên luôn thấy dữ liệu CẢ PHÒNG, không tự thu hẹp về riêng mình được như trưởng phòng/phó phòng/admin
   (đã có ô "Tôi là" ở thanh bên để làm việc này). Chỉ hiện nút này cho nhân viên (!S.canEdit) có gắn
   nhân sự (staff_name) – không có gì để lọc riêng nếu tài khoản chưa gắn nhân sự.
   locked=true (dùng ở Kế hoạch dự án – trang đó tự lọc theo "Tôi là" riêng, luôn cá nhân với nhân viên,
   không qua effectiveSimAs()): vẫn hiện ô này cho đồng bộ giao diện nhưng khoá cứng ở "Cá nhân", disabled
   không đổi được, phản ánh đúng thực tế thay vì cho chọn "Tổng thể" mà không có tác dụng gì. */
function scopeToggleHtml(locked){
  if(S.canEdit || !(S.user && S.user.staff_name)) return "";
  if(locked) return `<select class="inp" style="width:auto; flex:none" aria-label="Phạm vi xem" disabled title="Kế hoạch dự án luôn lọc theo chính mình">
    <option selected>Cá nhân</option>
  </select>`;
  S.scopeMode = S.scopeMode || "all";
  return `<select class="inp" data-act="scopemode" style="width:auto; flex:none" aria-label="Phạm vi xem">
    <option value="all" ${S.scopeMode==="all"?"selected":""}>Tổng thể</option>
    <option value="personal" ${S.scopeMode==="personal"?"selected":""}>Cá nhân</option>
  </select>`;
}
/* simAs dùng chung cho Dashboard/Tổng quan dự án/Tải tuần: trưởng phòng/phó phòng/admin thu hẹp qua "Tôi
   là" ở thanh bên; nhân viên thu hẹp qua nút Cá nhân/Tổng thể (scopeToggleHtml() ở trên, S.scopeMode). */
function effectiveSimAs(){
  if(S.canEdit) return (S.me && S.me!=="__all__") ? S.me : null;
  return (S.scopeMode==="personal" && S.user && S.user.staff_name) ? S.user.staff_name : null;
}



/* ================= ảnh dán vào form (kiểu ô "images") =================
   Ảnh chụp màn hình thường vài MB → thu nhỏ (cạnh dài tối đa 1280px) rồi nén JPEG trước khi lưu thành data URL
   ngay trong tài liệu, để vẫn nằm gọn trong giới hạn 5MB của máy chủ và không cần kho tệp riêng. */
const IMG_MAX_SIDE = 1280, IMG_QUALITY = 0.82;
function imgCompress(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, IMG_MAX_SIDE/Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.width*k)); c.height = Math.max(1, Math.round(im.height*k));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", IMG_QUALITY));
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh vừa dán.")); };
    im.src = url;
  });
}
const imgOk = u => typeof u==="string" && /^data:image\/(jpeg|png|webp);base64,/.test(u); // chỉ hiện ảnh đúng dạng, không nhận URL tuỳ ý
function imgFieldHTML(list){
  return `<div class="img-field" tabindex="0">${(list||[]).filter(imgOk).map((u,i)=>`<div class="img-th"><img src="${u}" alt="Ảnh ${i+1}"><button type="button" class="img-x" data-imgdel="${i}" aria-label="Bỏ ảnh ${i+1}">✕</button></div>`).join("")}</div>
    <div class="img-pick"><button type="button" class="btn" data-imgpick>+ Chọn ảnh / chụp ảnh</button><input type="file" accept="image/*" multiple hidden data-imgfile></div>`;
}

/* ================= ô chọn nhiều ("multi"): xổ xuống + hộp kiểm =================
   Nút hiện tóm tắt những người đã chọn; bấm để xổ danh sách hộp kiểm ngay dưới (đẩy nội dung xuống chứ không đè lên, để
   không bị khung cuộn của hộp thoại cắt). Từ 7 lựa chọn trở lên có thêm ô tìm tên và danh sách cuộn riêng nên vẫn dùng
   tốt khi phòng đông người. vals[key] luôn là mảng theo thứ tự của danh sách (không theo thứ tự bấm). */
const MSEL_SEARCH_MIN = 7;
function mselSummary(f, sel){
  const label = new Map((f.options||[]).map(o => [o[0], o[1]??o[0]])), names = (sel||[]).map(n => label.get(n)||n);
  if(!names.length) return '<span class="msel-ph">Chọn người…</span>';
  return `<span class="msel-names">${esc(names.join(", "))}</span><span class="msel-n">${names.length}</span>`;
}
function mselHTML(f, v){
  const sel = new Set(v||[]), opts = (f.options||[]).filter(o => o[0]);
  return `<button type="button" class="msel-btn" data-msel-toggle aria-expanded="false" ${f.disabled?"disabled":""}><span class="msel-sum">${mselSummary(f, v)}</span><span class="msel-caret" aria-hidden="true">▾</span></button>
    <div class="msel-panel" hidden>
      ${opts.length>=MSEL_SEARCH_MIN?'<input type="search" class="inp msel-q" placeholder="Tìm tên…" data-msel-q aria-label="Tìm tên">':""}
      <div class="msel-list">${opts.map(o=>`<label class="msel-item"><input type="checkbox" data-mv="${esc(o[0])}" ${sel.has(o[0])?"checked":""}><span>${esc(o[1]??o[0])}</span></label>`).join("")}</div>
      <div class="msel-foot"><span class="small muted msel-count"></span><button type="button" class="btn ghost" data-msel-clear>Bỏ chọn hết</button></div>
    </div>`;
}

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
    if(f.type==="text"||f.type==="number"||f.type==="password") ctl = `<input class="inp" id="${id}" type="${f.type==="number"?"number":f.type==="password"?"password":"text"}" ${f.type==="password"?'autocomplete="new-password"':""} ${f.type==="number"&&f.min!=null?`min="${f.min}"`:""} ${f.type==="number"&&f.max!=null?`max="${f.max}"`:""} ${f.type==="number"&&f.step!=null?`step="${f.step}"`:""} value="${esc(v??"")}" ${f.required?"required":""} ${dis}>`;
    else if(f.type==="date") ctl = `<input class="inp" id="${id}" type="date" value="${esc(v||"")}" ${dis}>`;
    /* "multi": chọn NHIỀU giá trị bằng các nút bật/tắt (vd nhiều TM/SE); vals[key] là mảng; f.options = [[giá trị, nhãn], …] */
    else if(f.type==="multi") ctl = `<div class="msel" id="${id}" data-mk="${esc(f.key)}">${mselHTML(f, v)}</div>`;
    else if(f.type==="datetime") ctl = `<input class="inp" id="${id}" type="datetime-local" value="${esc(v||"")}" ${f.required?"required":""} ${dis}>`; // giá trị dạng "YYYY-MM-DDTHH:MM"
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
    /* "images": ảnh dán (Ctrl+V) – vals[key] là mảng data URL; f.max = số ảnh tối đa (mặc định 4) */
    else if(f.type==="images") ctl = `<div id="${id}">${imgFieldHTML(v)}</div>`;
    /* "badge": không phải ô nhập, chỉ hiển thị tĩnh (vd số giờ còn lại cạnh ô nhập giờ) – dùng f.text, không đọc/ghi vals */
    else if(f.type==="badge") ctl = `<div class="field-badge"><span class="pill ${esc(f.tone||"info")}">${esc(f.text||"")}</span></div>`;
    return `<div class="field" ${f.half?'data-half="1"':""} data-field="${f.key}" ${f.showIf && !f.showIf(vals)?"hidden":""}>${f.type==="check"?"":`<label for="${id}">${esc(f.label)}${f.required?' <span style="color:var(--bad)">*</span>':""}</label>`}${ctl}${hint!==""?`<div class="hint" data-hint="${f.key}">${esc(hint)}</div>`:`<div class="hint" data-hint="${f.key}"></div>`}</div>`;
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
    <div class="drawer-f"><div>${cfg.onDelete?'<button class="btn danger" data-del>Xoá</button>':""}</div><div class="toolbar">${cfg.extraBtn?`<button class="btn" data-extra>${esc(cfg.extraBtn.label)}</button>`:""}<button class="btn" data-close>${cfg.readOnly?"Đóng":"Huỷ"}</button>${cfg.readOnly?"":`<button class="btn primary" data-save>${esc(cfg.saveLabel||"Lưu")}</button>`}</div></div></div>`;
  const dlg = layer.querySelector(".drawer");
  const api = {
    setValue(key, value){ vals[key]=value; const el=dlg.querySelector("#f_"+key); if(el) el.value=value??""; },
    setDisabled(key, disabled){ const f=cfg.fields.find(x=>x.key===key); if(f) f.disabled=disabled; const el=dlg.querySelector("#f_"+key); if(el) el.disabled=disabled; },
    setOptions(key, opts){ optsOverride[key]=opts; vals[key]=""; const f = cfg.fields.find(x=>x.key===key); const wrap = dlg.querySelector(`[data-field="${key}"]`); if(f && wrap){ const tmp=document.createElement("div"); tmp.innerHTML=fieldHTML(f); wrap.replaceWith(tmp.firstElementChild); } }
  };
  /* f.showIf(vals) → ẩn/hiện ô theo giá trị các ô khác (vd "Cả ngày" ẩn ô giờ); chạy lại sau mỗi lần đổi giá trị */
  const applyShowIf = () => { for(const f of cfg.fields){ if(!f.showIf) continue; const w = dlg.querySelector(`[data-field="${f.key}"]`); if(w) w.hidden = !f.showIf(vals); } };
  const readInputs = () => { for(const f of cfg.fields){ if(!f.key) continue; const el = dlg.querySelector("#f_"+f.key); if(!el) continue; if(f.type==="check") vals[f.key]=el.checked; else if(f.type==="number") vals[f.key]=el.value===""?null:+el.value; else if(f.type!=="seg" && f.type!=="images" && f.type!=="multi") vals[f.key]=el.value||(f.type==="date"?null:""); } };
  const close = () => { layer.innerHTML=""; document.removeEventListener("keydown", onKey); if(prevFocus && prevFocus.focus) prevFocus.focus(); };
  const onKey = e => { if(e.key==="Escape") close(); };
  document.addEventListener("keydown", onKey);
  dlg.addEventListener("click", async e => {
    const sb = e.target.closest(".seg-in button");
    /* Ô chọn nhiều: bấm ra ngoài thì thu các ô đang xổ; bấm nút thì xổ/thu; "Bỏ chọn hết" */
    for(const p of dlg.querySelectorAll(".msel-panel:not([hidden])")){ if(!p.parentElement.contains(e.target)){ p.hidden = true; p.parentElement.querySelector("[data-msel-toggle]").setAttribute("aria-expanded","false"); } }
    const mt = e.target.closest("[data-msel-toggle]");
    if(mt){ const panel = mt.parentElement.querySelector(".msel-panel"), open = panel.hidden; panel.hidden = !open; mt.setAttribute("aria-expanded", open?"true":"false");
      if(open){ const q = panel.querySelector("[data-msel-q]"); if(q) q.focus(); } return; }
    const mc = e.target.closest("[data-msel-clear]");
    if(mc){ const box = mc.closest(".msel"), k = box.dataset.mk, fm = cfg.fields.find(x=>x.key===k); vals[k] = [];
      box.querySelectorAll("input[data-mv]").forEach(c => c.checked = false); box.querySelector(".msel-sum").innerHTML = mselSummary(fm, []); applyShowIf(); if(fm.onChange) fm.onChange([], api); return; }
    if(sb){ const k=sb.dataset.k; const v=JSON.parse(sb.dataset.v); vals[k]=v; applyShowIf(); sb.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed", b===sb)); const f=cfg.fields.find(x=>x.key===k); const hn=dlg.querySelector(`[data-hint="${k}"]`); if(f && hn && typeof f.hint==="function") hn.textContent=f.hint(v, vals); return; }
    if(e.target.closest("[data-imgpick]")){ const inp = dlg.querySelector("[data-imgfile]"); if(inp) inp.click(); return; }
    const ix = e.target.closest("[data-imgdel]");
    if(ix){ const fi = cfg.fields.find(x=>x.type==="images"); if(fi){ vals[fi.key] = (vals[fi.key]||[]).filter((_, j) => j!==+ix.dataset.imgdel); dlg.querySelector("#f_"+fi.key).innerHTML = imgFieldHTML(vals[fi.key]); } return; }
    if(e.target.closest("[data-save]")){
      readInputs();
      for(const f of cfg.fields){ if(f.required && !(f.showIf && !f.showIf(vals)) && (vals[f.key]==null || vals[f.key]==="" || (Array.isArray(vals[f.key]) && !vals[f.key].length))){ toast("Còn thiếu: "+f.label); return; } }
      const btn = e.target.closest("[data-save]"); btn.disabled=true;
      try{ await cfg.onSave(vals); close(); }catch(err){ btn.disabled=false; if(err && err.message) toast(err.message); }
      return;
    }
    if(e.target.closest("[data-del]")){ try{ const r = await cfg.onDelete(); if(r!==false) close(); }catch(err){} return; }
    if(e.target.closest("[data-extra]")){ close(); cfg.extraBtn.onClick(); return; }
  });
  dlg.addEventListener("input", e => { // tìm tên trong ô chọn nhiều (bỏ dấu, không phân biệt hoa thường)
    const q = e.target.closest && e.target.closest("[data-msel-q]"); if(!q) return;
    const norm = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase(), key = norm(q.value.trim());
    q.parentElement.querySelectorAll(".msel-item").forEach(it => { it.hidden = !!key && !norm(it.textContent).includes(key); });
  });
  dlg.addEventListener("change", e => {
    const mcb = e.target.closest && e.target.closest(".msel input[data-mv]");
    if(mcb){ const box = mcb.closest(".msel"), k = box.dataset.mk, fm = cfg.fields.find(x=>x.key===k);
      vals[k] = [...box.querySelectorAll("input[data-mv]")].filter(c=>c.checked).map(c=>c.dataset.mv); // theo thứ tự danh sách
      box.querySelector(".msel-sum").innerHTML = mselSummary(fm, vals[k]); applyShowIf(); if(fm.onChange) fm.onChange(vals[k], api); return; }
    const el = e.target; if(!el.id || !el.id.startsWith("f_")) return;
    const key = el.id.slice(2); const f = cfg.fields.find(x=>x.key===key); readInputs();
    if(f && f.onChange) f.onChange(vals[key], api);
    applyShowIf();
    const hn = dlg.querySelector(`[data-hint="${key}"]`); if(f && hn && typeof f.hint==="function") hn.textContent=f.hint(vals[key], vals);
    cfg.fields.forEach(g=>{ if(typeof g.hint==="function"){ const h2=dlg.querySelector(`[data-hint="${g.key}"]`); if(h2) h2.textContent=g.hint(vals[g.key], vals); } });
  });
  /* Thêm ảnh: dán (Ctrl+V / giữ chạm → Dán) hoặc nút "Chọn ảnh / chụp ảnh" (thư viện ảnh, máy ảnh điện thoại).
     Chỉ xử lý khi clipboard có ảnh – dán chữ vẫn như thường. */
  const fImg = cfg.fields.find(x=>x.type==="images");
  const addImages = async files => {
    const max = fImg.max || 4, cur = [...(vals[fImg.key] || [])];
    if(cur.length >= max){ toast("Tối đa "+max+" ảnh – bỏ bớt ảnh cũ trước khi thêm."); return; }
    try{
      for(const fl of files.slice(0, max-cur.length)) cur.push(await imgCompress(fl));
      vals[fImg.key] = cur; dlg.querySelector("#f_"+fImg.key).innerHTML = imgFieldHTML(cur);
    }catch(err){ toast(err.message || "Không thêm được ảnh."); }
  };
  if(fImg && !cfg.readOnly){
    dlg.addEventListener("paste", async e => {
      const files = [...(e.clipboardData ? e.clipboardData.items : [])].filter(it => it.kind==="file" && /^image\//.test(it.type)).map(it => it.getAsFile()).filter(Boolean);
      if(!files.length) return;
      e.preventDefault(); await addImages(files);
    });
    dlg.addEventListener("change", async e => {
      const inp = e.target.closest && e.target.closest("[data-imgfile]"); if(!inp) return;
      const files = [...inp.files].filter(x => /^image\//.test(x.type)); inp.value = "";
      if(files.length) await addImages(files);
    });
  }
  layer.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", close));
  setTimeout(()=>{ const first = dlg.querySelector("input,select,textarea,.seg-in button"); (first||dlg.querySelector("[data-close]")).focus(); }, 30);
}
