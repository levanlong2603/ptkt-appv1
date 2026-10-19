"use strict";
/* Module mở rộng: Lịch & sự kiện (tab "Lịch" của mục "Việc trong tuần", ngang hàng Tải tuần/Đầu việc; thay cho "Nhật ký
   tuần" cũ). Chỉ chế độ TUẦN: 7 cột Thứ 2 → CN, hàng "Cả ngày" ở trên, lưới giờ 00:00–24:00 cuộn dọc bên dưới.
   Dữ liệu: collection "events" (RULES.events = "own" ở backend/server.js) – mỗi sự kiện
   {title, allDay, start, end, place, note, person}: giờ là chuỗi "YYYY-MM-DDTHH:MM" (giờ địa phương, không múi giờ);
   cả ngày là "YYYY-MM-DD" (ngày kết thúc tính LUÔN). person = nhân sự sở hữu; "" = sự kiện cả phòng (hiện ở lịch của mọi
   người, chỉ trưởng phòng/phó phòng/admin tạo được). Nhân viên chỉ tạo/sửa/xoá sự kiện của chính mình; máy chủ kiểm tra lại.
   Chọn tuần dùng chung S.week với Tải tuần/Đầu việc; xem lịch của ai theo "Tôi là" (S.me) – "Tất cả" (chỉ trưởng phòng)
   hiện mọi người kèm tên. Tiền tố hàm/hằng: cal / CAL_. */
const CAL_HOUR_H = 44;                       // chiều cao 1 giờ trên lưới (px) – phải khớp --cal-hour trong calendar.css
const CAL_DOW = ["T2","T3","T4","T5","T6","T7","CN"];
S.events = S.events || [];
ON_SESSION.push(db => db.collection("events").onSnapshot(snap => {
  S.events = snap.docs.map(d => ({...d.data(), id: d.id}));
  schedule();
}));

/* Lịch của ai: người đang chọn ở "Tôi là", không thì nhân sự gắn với tài khoản. allMode = trưởng phòng đang xem "Tất cả". */
const calWho = () => (S.me && S.me!=="__all__") ? S.me : ((S.user && S.user.staff_name) || "");
const calAllMode = () => !!S.canEdit && S.me==="__all__";
const calMine = e => calAllMode() || e.person==="" || e.person===calWho();
const calMins = hhmm => (+hhmm.slice(0,2))*60 + (+hhmm.slice(3,5));
const calHHMM = m => String(Math.floor(m/60)%24).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
const calDayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5); // số ngày từ a đến b (cả 2 là YYYY-MM-DD)

/* Cắt 1 sự kiện theo giờ thành các đoạn trong từng ngày của tuần: [{day:0..6, s, e (phút), ev}] */
function calSegments(ev, days){
  const out = [];
  days.forEach((d, i) => {
    const dayS = d + "T00:00", dayE = addDays(d, 1) + "T00:00";
    const s = ev.start > dayS ? ev.start : dayS, e = ev.end < dayE ? ev.end : dayE;
    if(e <= s) return;
    out.push({day:i, s: s.slice(0,10)===d ? calMins(s.slice(11)) : 0, e: e===dayE ? 1440 : calMins(e.slice(11)), ev});
  });
  return out;
}
/* Xếp các đoạn chồng giờ trong 1 ngày thành các làn song song: gán lane/lanes cho từng đoạn */
function calLanes(segs){
  segs.sort((a,b) => a.s-b.s || b.e-a.e);
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = cluster.reduce((m,x)=>Math.max(m,x.lane+1), 1); cluster.forEach(x=>x.lanes=n); cluster = []; };
  for(const sg of segs){
    if(cluster.length && sg.s >= clusterEnd){ flush(); clusterEnd = -1; }
    const taken = new Set(cluster.filter(x=>x.e > sg.s).map(x=>x.lane));
    let l = 0; while(taken.has(l)) l++;
    sg.lane = l; cluster.push(sg); clusterEnd = Math.max(clusterEnd, sg.e);
  }
  flush();
  return segs;
}

function viewCalendar(){
  const w = S.week, days = [0,1,2,3,4,5,6].map(i => addDays(w, i)), today = todayISO();
  const evs = (S.events||[]).filter(calMine);
  const canAdd = !!(S.user && (S.canEdit || S.user.staff_name));
  const label = e => (calAllMode() && e.person ? e.person + " · " : "") + e.title;
  const cls = e => e.person==="" ? "team" : "own";
  /* ---- hàng "Cả ngày": sự kiện cả ngày (và sự kiện giờ kéo dài ≥ 24h không cần – đã cắt theo ngày ở lưới) ---- */
  const allDay = evs.filter(e => e.allDay && e.end >= days[0] && e.start <= days[6])
    .map(e => ({e, c0: Math.max(0, calDayDiff(days[0], e.start)), c1: Math.min(6, calDayDiff(days[0], e.end))}))
    .sort((a,b) => a.c0-b.c0 || b.c1-a.c1);
  const rowsEnd = []; // hàng i → cột kết thúc cuối cùng đã dùng
  for(const x of allDay){ let r = 0; while(rowsEnd[r] !== undefined && rowsEnd[r] >= x.c0) r++; rowsEnd[r] = x.c1; x.row = r; }
  const adHtml = allDay.map(x => `<button type="button" class="cal-ev cal-ad ${cls(x.e)}" data-act="calev" data-id="${esc(x.e.id)}" style="grid-column:${x.c0+1} / ${x.c1+2}; grid-row:${x.row+1}" title="${esc(x.e.title)}">
      <b>${esc(label(x.e))}</b>${x.e.place?`<span>${esc(x.e.place)}</span>`:""}</button>`).join("");
  /* ---- lưới giờ ---- */
  const timed = evs.filter(e => !e.allDay);
  const byDay = days.map(() => []);
  for(const e of timed) for(const sg of calSegments(e, days)) byDay[sg.day].push(sg);
  const nowM = new Date().getHours()*60 + new Date().getMinutes();
  const cols = days.map((d, i) => {
    const segs = calLanes(byDay[i]);
    const blocks = segs.map(sg => {
      const top = sg.s/60*CAL_HOUR_H, h = Math.max((sg.e-sg.s)/60*CAL_HOUR_H - 2, 20);
      const wpc = 100/sg.lanes, left = sg.lane*wpc;
      return `<button type="button" class="cal-ev ${cls(sg.ev)}${h<52?" short":""}${sg.lanes>=3?" narrow":""}" data-act="calev" data-id="${esc(sg.ev.id)}" style="top:${top}px; height:${h}px; left:calc(${left}% + 2px); width:calc(${wpc}% - 4px)"
        title="${esc(sg.ev.title)} · ${calHHMM(sg.s)}–${sg.e>=1440?"24:00":calHHMM(sg.e)}">
        <b>${esc(label(sg.ev))}</b><em>${calHHMM(sg.s)}–${sg.e>=1440?"24:00":calHHMM(sg.e)}</em>${sg.ev.place?`<span>${esc(sg.ev.place)}</span>`:""}</button>`;
    }).join("");
    return `<div class="cal-col${d===today?" today":""}" data-act="calslot" data-day="${d}" aria-label="Thêm sự kiện ngày ${dmy(d)}">${blocks}${d===today?`<i class="cal-now" style="top:${nowM/60*CAL_HOUR_H}px"></i>`:""}</div>`;
  }).join("");
  const hours = Array.from({length:24}, (_, h) => `<div class="cal-hr"><span>${h?String(h).padStart(2,"0")+":00":""}</span></div>`).join("");
  const head = days.map((d, i) => `<div class="cal-dh${d===today?" today":""}"><b>${+d.slice(8)}</b> ${CAL_DOW[i]}</div>`).join("");
  /* sau khi vẽ: đưa vùng cuộn về vị trí đã nhớ (mặc định 07:00) – render() thay toàn bộ DOM nên phải đặt lại mỗi lần */
  setTimeout(() => { const b = document.querySelector(".cal-body"); if(b) b.scrollTop = S.calScroll!=null ? S.calScroll : 7*CAL_HOUR_H - 6; }, 0);
  return `<div class="head"><div><h1>Việc trong tuần</h1></div>${weekNav()}</div>${weekTabs()}
    <section class="panel cal"><div class="cal-bar"><div class="cal-title">${dm(days[0])} – ${dm(days[6])}/${days[6].slice(0,4)}${calAllMode()?'<span class="small muted"> · lịch của mọi người</span>':""}<span class="small muted" style="font-weight:400"> · nhắc trước ${CAL_LEAD_MIN} phút ở chuông thông báo</span></div>
      ${canAdd?'<button class="btn primary" data-act="caladd">+ Thêm sự kiện</button>':""}</div>
      <div class="cal-scroll"><div class="cal-grid">
        <div class="cal-row cal-headrow"><div class="cal-corner">Giờ</div>${head}</div>
        <div class="cal-row cal-adrow"><div class="cal-corner small">Cả ngày</div><div class="cal-adgrid" style="grid-column:2 / 9" data-act="caladdday">${adHtml}</div></div>
        <div class="cal-body"><div class="cal-row cal-rows"><div class="cal-gutter">${hours}</div>${cols}</div></div>
      </div></div>
      ${evs.length?"":'<div class="cal-empty small muted">Chưa có sự kiện nào trong tuần này. Bấm “+ Thêm sự kiện” hoặc bấm vào một ô giờ trên lịch.</div>'}</section>`;
}

/* ---- form thêm/sửa ---- */
function calForm(ev, preset){
  const isNew = !ev;
  const people = [["","Cả phòng (hiện ở lịch của mọi người)"], ...M.staff.map(s=>[s.name, s.name])];
  const dflt = preset || {};
  const v = ev ? {...ev, startD: ev.allDay ? ev.start : ev.start.slice(0,10), endD: ev.allDay ? ev.end : ev.end.slice(0,10), startDt: ev.allDay ? ev.start+"T08:00" : ev.start, endDt: ev.allDay ? ev.end+"T09:00" : ev.end}
    : {title:"", allDay:false, place:"", note:"", person: S.canEdit ? calWho() : "", startDt: dflt.start, endDt: dflt.end, startD: dflt.start.slice(0,10), endD: dflt.start.slice(0,10)};
  const canEditThis = isNew || S.canEdit || (S.user && ev.created_by===S.user.username);
  openForm({title: isNew ? "Thêm mới sự kiện" : (canEditThis ? "Sửa sự kiện" : "Sự kiện"), subtitle: isNew ? "" : (ev.person || "Cả phòng"), values:v, readOnly: !canEditThis,
    fields:[
      {key:"title", label:"Tên sự kiện", type:"text", required:true},
      {key:"allDay", label:"Cả ngày", type:"check"},
      {key:"startDt", label:"Thời gian bắt đầu", type:"datetime", half:true, required:true, showIf:x=>!x.allDay},
      {key:"endDt", label:"Thời gian kết thúc", type:"datetime", half:true, required:true, showIf:x=>!x.allDay},
      {key:"startD", label:"Ngày bắt đầu", type:"date", half:true, required:true, showIf:x=>!!x.allDay},
      {key:"endD", label:"Ngày kết thúc", type:"date", half:true, required:true, showIf:x=>!!x.allDay},
      {key:"place", label:"Địa điểm", type:"text"},
      {key:"note", label:"Ghi chú", type:"textarea"},
      ...(S.canEdit ? [{key:"person", label:"Của ai", type:"select", options:people}] : [])
    ],
    saveLabel: isNew ? "Thêm mới" : "Lưu thay đổi",
    onDelete: (!isNew && canEditThis) ? async () => { if(!confirm("Xoá sự kiện này?")) return false; await remove("events/"+ev.id); toast("Đã xoá sự kiện"); } : undefined,
    onSave: async x => {
      const title = (x.title||"").trim(); if(!title) throw new Error("Nhập tên sự kiện.");
      const rec = {title, allDay: !!x.allDay, place:(x.place||"").trim(), note:(x.note||"").trim(),
        start: x.allDay ? x.startD : x.startDt, end: x.allDay ? x.endD : x.endDt, person: S.canEdit ? (x.person||"") : undefined};
      if(!rec.start || !rec.end) throw new Error("Chọn thời gian bắt đầu và kết thúc.");
      if(x.allDay ? rec.end < rec.start : rec.end <= rec.start) throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
      if(rec.person===undefined) delete rec.person;
      await write("events/"+(isNew ? uid("ev") : ev.id), rec);
      toast(isNew ? "Đã thêm sự kiện" : "Đã lưu sự kiện");
    }});
}
const calPad = n => String(n).padStart(2,"0");
/* Thời điểm mặc định cho sự kiện mới: dayISO + phút bắt đầu (làm tròn 30'), kéo dài 1 giờ (không vượt qua nửa đêm) */
function calDefaultRange(dayISO, startMin){
  const s = Math.min(Math.max(startMin, 0), 23*60), e = Math.min(s + 60, 24*60 - 1);
  return {start: dayISO + "T" + calHHMM(s), end: dayISO + "T" + (e===24*60-1 ? "23:59" : calHHMM(e))};
}
ACTIONS["caladd"] = () => {
  /* Xin quyền thông báo của trình duyệt đúng lúc người dùng chủ động tạo sự kiện (trình duyệt chỉ cho hỏi khi có thao tác bấm) */
  try{ if(window.Notification && Notification.permission==="default") Notification.requestPermission(); }catch(e){}
  const today = todayISO(), inWeek = today >= S.week && today <= addDays(S.week, 6);
  const day = inWeek ? today : S.week, n = new Date();
  calForm(null, calDefaultRange(day, inWeek ? Math.ceil((n.getHours()*60 + n.getMinutes()) / 30) * 30 : 9*60));
};
/* Bấm vào ô giờ trống của 1 ngày → sự kiện mới bắt đầu đúng giờ đã bấm (làm tròn 30') */
ACTIONS["calslot"] = (el, e) => {
  if(!(S.user && (S.canEdit || S.user.staff_name))) return;
  const r = el.getBoundingClientRect(), y = Math.max(0, (e && e.clientY != null ? e.clientY : r.top) - r.top);
  calForm(null, calDefaultRange(el.dataset.day, Math.floor(y / CAL_HOUR_H * 2) * 30));
};
ACTIONS["caladdday"] = (el, e) => {
  if(!(S.user && (S.canEdit || S.user.staff_name))) return;
  const r = el.getBoundingClientRect(), i = Math.min(6, Math.max(0, Math.floor(((e && e.clientX != null ? e.clientX : r.left) - r.left) / r.width * 7))), d = addDays(S.week, i);
  calForm(null, {start: d + "T08:00", end: d + "T09:00"});
};
ACTIONS["calev"] = el => { const ev = (S.events||[]).find(x => x.id===el.dataset.id); if(ev) calForm(ev); };
/* ================= Nhắc trước giờ bắt đầu (chuông thông báo) =================
   Sự kiện THEO GIỜ của chính người đang đăng nhập (person = nhân sự gắn với tài khoản) hoặc của cả phòng (person ""),
   bắt đầu trong vòng CAL_LEAD_MIN phút tới → hiện ở chuông thông báo (ui.js renderHeader() gọi calUpcoming()), kèm 1 toast
   và thông báo của trình duyệt (nếu người dùng đã cho phép) đúng 1 lần cho mỗi sự kiện. Sự kiện cả ngày không nhắc.
   Không có máy chủ đẩy: trình duyệt tự kiểm tra mỗi 30 giây khi đang mở ứng dụng. */
const CAL_LEAD_MIN = 30;
const calLocal = s => new Date(+s.slice(0,4), +s.slice(5,7)-1, +s.slice(8,10), +s.slice(11,13), +s.slice(14,16));
function calUpcoming(now = new Date()){
  if(!S.user) return [];
  const mine = S.user.staff_name || "";
  return (S.events||[]).filter(e => !e.allDay && e.start && (e.person==="" || (mine && e.person===mine)))
    .map(e => ({e, inMin: Math.ceil((calLocal(e.start) - now) / 60000)}))
    .filter(x => x.inMin >= 0 && x.inMin <= CAL_LEAD_MIN)
    .sort((a, b) => a.inMin - b.inMin);
}
const calLeftText = n => n<=0 ? "bắt đầu ngay bây giờ" : "còn " + n + " phút";
function calNotifiedGet(){ try{ return JSON.parse(localStorage.getItem("ptkt.evNoti")||"{}") || {}; }catch(e){ return {}; } }
function calNotifiedSet(m){ try{ localStorage.setItem("ptkt.evNoti", JSON.stringify(m)); }catch(e){} }
/* Mỗi 30 giây: cập nhật chuông; sự kiện mới lọt vào cửa sổ nhắc thì báo 1 lần (nhớ theo mã + giờ bắt đầu, nên dời giờ thì báo lại) */
function calTick(){
  if(!(S.user && S.loaded)) return;
  const ups = calUpcoming(), seen = calNotifiedGet(), now = Date.now();
  let changed = false;
  for(const k of Object.keys(seen)) if(now - seen[k] > 864e5){ delete seen[k]; changed = true; } // bỏ ghi nhớ cũ hơn 1 ngày
  for(const x of ups){
    const key = x.e.id + "@" + x.e.start;
    if(seen[key]) continue;
    seen[key] = now; changed = true;
    const msg = x.e.title + " · " + x.e.start.slice(11) + (x.e.place ? " · " + x.e.place : "");
    toast("Sắp diễn ra (" + calLeftText(x.inMin) + "): " + msg);
    try{ if(window.Notification && Notification.permission==="granted") new Notification("Sắp diễn ra – " + calLeftText(x.inMin), {body: msg, tag: key}); }catch(e){}
  }
  if(changed) calNotifiedSet(seen);
  renderHeader(); // làm mới số trên chuông và bảng chuông (cả khi sự kiện vừa hết hiệu lực nhắc)
}
setInterval(calTick, 30000);
setTimeout(calTick, 4000);

/* Nhớ vị trí cuộn của lưới giờ (scroll không nổi bọt → bắt ở pha capture) */
main.addEventListener("scroll", e => { if(e.target.classList && e.target.classList.contains("cal-body")) S.calScroll = e.target.scrollTop; }, true);
