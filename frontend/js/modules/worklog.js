"use strict";
/* Module mở rộng: Nhật ký tuần – ghi chú tự do việc đã làm theo từng ngày trong tuần, gắn liền trong
   "Việc trong tuần" (weekly-input.js, chế độ S.wkMode="journal") – KHÔNG phải trang riêng, chỉ đổi nội
   dung hiển thị bên dưới khối tóm tắt, giữ nguyên tiêu đề/tóm tắt phía trên. Hoàn toàn tách biệt khỏi
   workload/báo cáo/tiến độ dự án (không đọc M, không được M.* đọc lại) – chỉ là "sổ tay" cá nhân.
   Quyền: "own-week" như weeks (RULES ở backend/server.js) – nhân viên chỉ thấy/ghi nhật ký của chính
   mình (và chỉ tuần hiện tại trở đi, tuần cũ khoá); trưởng phòng/phó phòng/admin thấy/ghi được của mọi
   người (qua "Tôi là" ở thanh bên, dùng chung S.me với Việc trong tuần/Tải tuần). */
ON_SESSION.push(db => {
  const cutoff = addDays(mondayOf(todayISO()), -7*156);
  db.collection("worklog").where("week", ">=", cutoff).onSnapshot(snap => {
    S.worklogs = snap.docs.map(d=>({...d.data(), _id:d.id})); schedule();
  });
});
function worklogDocId(week, person){ return week+"__"+slug(person); }
function worklogDoc(week, person){ return (S.worklogs||[]).find(w=>w.week===week && w.person===person); }
function saveWorklogDays(week, person, days){ return write("worklog/"+worklogDocId(week,person), {week, person, days}); }
const WL_DAY_LABEL = ["Chủ nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"];
/* Trả về đoạn HTML bảng theo ngày (không phải cả trang) – weekly-input.js chèn thẳng vào dưới khối tóm
   tắt khi S.wkMode==="journal". Khác hẳn "locked" của dữ liệu tuần thường (own-week): nhật ký riêng tư
   (own-week-self, backend/server.js) – CHỈ chính chủ (S.user.staff_name === người đang xem) mới sửa
   được, và chỉ tuần hiện tại trở đi; admin (tài khoản hệ thống) là ngoại lệ duy nhất sửa được tất cả, kể
   cả tuần cũ/của người khác. Trưởng phòng/phó phòng xem "Tôi là" người khác thì bị khoá y như xem hộ. */
function worklogPanelHtml(){
  const w = S.week, person = S.me;
  const isAdmin = !!(S.user && S.user.role==="admin");
  const isOwner = !!(S.user && S.user.staff_name===person);
  const locked = !isAdmin && (!isOwner || w < mondayOf(todayISO()));
  const lockMsg = !isOwner && !isAdmin ? "Nhật ký riêng tư – chỉ chính chủ mới ghi được."
    : `Tuần ${isoWeek(w)} đã qua, không ghi thêm được nữa.`;
  const doc = worklogDoc(w, person);
  const saved = new Map((doc && doc.days || []).map(d=>[d.date, d.text||""]));
  /* Thứ 7/Chủ nhật chỉ hiện nếu đã có trong dữ liệu đã lưu, HOẶC phiên này vừa bấm "+ Thêm..." cho ĐÚNG
     tuần + người đang xem (so khớp week+person, không dùng boolean trần, để đổi tuần/người khác không bị
     dính nhầm dòng "ảo" chưa lưu). */
  const satDate = addDays(w,5), sunDate = addDays(w,6);
  const flagMatch = f => f && f.week===w && f.person===person;
  const showSat = saved.has(satDate) || flagMatch(S.wlShowSat);
  const showSun = saved.has(sunDate) || flagMatch(S.wlShowSun);
  const fixedDates = new Set([0,1,2,3,4].map(i=>addDays(w,i)));
  const dates = [...fixedDates];
  if(showSat) dates.push(satDate);
  if(showSun) dates.push(sunDate);
  /* Thứ 2–Thứ 6 là cấu trúc cố định, không xoá được (chỉ xoá nội dung rồi Lưu); riêng Thứ 7/Chủ nhật vừa
     thêm vào thì có nút ✕ để bỏ hẳn dòng đó (xoá khỏi dữ liệu đã lưu lẫn khỏi hiển thị). */
  const row = date => { const d = parse(date); const removable = !fixedDates.has(date);
    return `<tr><td class="cell-main" style="width:140px">${WL_DAY_LABEL[d.getDay()]} <span class="muted small">${dm(date)}</span></td>
      <td><textarea class="inp" data-day="${date}" rows="3" style="resize:vertical" placeholder="Ghi việc đã làm ngày này…" ${locked?"disabled":""}>${esc(saved.get(date)||"")}</textarea></td>
      <td style="width:44px; text-align:center">${removable&&!locked?`<button class="btn ghost icon" data-act="wkdelday" data-day="${date}" aria-label="Xoá ngày này">✕</button>`:""}</td></tr>`; };
  return `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:140px">Ngày</th><th>Nội dung công việc</th><th style="width:44px"></th></tr></thead>
    <tbody>${dates.map(row).join("")}</tbody></table></section>
    ${locked ? `<p class="small muted" style="margin:10px 0 0">${esc(lockMsg)}</p>` : `
    <div class="toolbar" style="margin-top:12px; justify-content:flex-end">
      ${showSat?"":'<button class="btn" data-act="wkaddsat">+ Thêm Thứ 7</button>'}
      ${showSun?"":'<button class="btn" data-act="wkaddsun">+ Thêm Chủ nhật</button>'}
      <button class="btn primary" data-act="wksave">Lưu nhật ký</button>
    </div>`}`;
}
ACTIONS["wkjournal"] = () => { S.wkMode = "journal"; render(); };
ACTIONS["wkback"] = () => { S.wkMode = "tasks"; render(); };
ACTIONS["wkaddsat"] = () => { S.wlShowSat = {week:S.week, person:S.me}; render(); };
ACTIONS["wkaddsun"] = () => { S.wlShowSun = {week:S.week, person:S.me}; render(); };
ACTIONS["wksave"] = async () => {
  const days = [...document.querySelectorAll("textarea[data-day]")].map(el => ({date: el.dataset.day, text: el.value.trim()}));
  try{ await saveWorklogDays(S.week, S.me, days); toast("Đã lưu nhật ký tuần"); }catch(e){}
};
/* Xoá hẳn dòng Thứ 7/Chủ nhật vừa thêm: bỏ khỏi dữ liệu đã lưu (nếu có) và bỏ cờ phiên đang hiện, rồi vẽ
   lại – không đụng tới Thứ 2–Thứ 6 (cấu trúc cố định, nút này không hiện ở đó). */
ACTIONS["wkdelday"] = async el => {
  const date = el.dataset.day, w = S.week, person = S.me;
  if(S.wlShowSat && S.wlShowSat.week===w && S.wlShowSat.person===person && date===addDays(w,5)) S.wlShowSat = null;
  if(S.wlShowSun && S.wlShowSun.week===w && S.wlShowSun.person===person && date===addDays(w,6)) S.wlShowSun = null;
  const doc = worklogDoc(w, person);
  if(doc && (doc.days||[]).some(d=>d.date===date)){
    try{ await saveWorklogDays(w, person, doc.days.filter(d=>d.date!==date)); }catch(e){ return; }
  }
  render();
};
