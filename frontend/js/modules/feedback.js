"use strict";
/* Module mở rộng: Góp ý – mọi người gửi nhận xét/yêu cầu cải tiến, hiển thị theo tên nhân sự.
   Quyền ghi: RULES.feedback = "own" (backend/server.js) – ai cũng tạo mới được; sửa/xoá thì chỉ
   người tạo hoặc trưởng phòng. Trường person/created_by/createdAt luôn do máy chủ ghi (xem route
   PUT /api/doc/:coll/:id trong server.js), không nhận từ client. */
const FB_TYPES = ["Nhận xét", "Yêu cầu cải tiến"];
/* Trạng thái xử lý góp ý – chỉ trưởng phòng đổi được (RULES.feedback="own" đã cho trưởng phòng sửa mọi
   góp ý). Không có trường này (góp ý cũ) coi như "Mới". */
const FB_STATUS = ["Mới", "Đang xem xét", "Đã thực hiện"];
const FB_STATUS_CLS = {"Mới":"mute", "Đang xem xét":"warn", "Đã thực hiện":"ok"};
ON_SESSION.push(db => db.collection("feedback").onSnapshot(snap => {
  S.feedback = snap.docs.map(d => ({...d.data(), id: d.id})).sort((a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  schedule();
}));
/* Chấm thông báo ở menu "Góp ý": đếm số góp ý có từ sau lần cuối mở trang này (lưu mốc thời gian
   riêng trên trình duyệt, giống cách "Tôi là"/"view" đang lưu – không đồng bộ giữa các thiết bị). */
NAV_BADGE.feedback = () => { const seen = store("fbSeen")||""; return S.feedback.filter(f=>(f.createdAt||"")>seen).length; };
function viewFeedback(){
  const seen = store("fbSeen")||"";
  if(S.feedback.some(f=>(f.createdAt||"")>seen)){ store("fbSeen", new Date().toISOString()); schedule(); }
  let h = `<div class="head"><h1>Góp ý</h1>
    <button class="btn primary" data-act="addfeedback">+ Gửi góp ý</button></div>`;
  if(!S.feedback.length) return h + `<section class="panel"><div class="empty"><b>Chưa có góp ý nào</b>Bấm "+ Gửi góp ý" để gửi nhận xét hoặc đề xuất cải tiến đầu tiên.</div></section>`;
  h += S.feedback.map(f => {
    const mine = S.user && (f.created_by===S.user.username || S.canEdit);
    const tcls = f.type==="Yêu cầu cải tiến" ? "info" : "mute";
    const status = f.status || "Mới";
    const statusUI = S.canEdit
      ? `<div class="seg-in" role="group" aria-label="Trạng thái xử lý">${FB_STATUS.map(s=>`<button type="button" data-act="fbstatus" data-id="${esc(f.id)}" data-v="${esc(s)}" aria-pressed="${status===s}">${esc(s)}</button>`).join("")}</div>`
      : `<span class="pill ${FB_STATUS_CLS[status]||"mute"}">${esc(status)}</span>`;
    return `<section class="panel" style="margin-bottom:12px"><div class="panel-b">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
        <b>${esc(f.person||"–")}</b><span class="pill ${tcls}">${esc(f.type||"Nhận xét")}</span>
        ${S.canEdit?"":`<span class="pill ${FB_STATUS_CLS[status]||"mute"}">${esc(status)}</span>`}
        <span class="small muted" style="margin-left:auto">${f.createdAt?dmy(f.createdAt.slice(0,10)):"–"}</span></div>
      <p style="white-space:pre-wrap; margin:10px 0 0">${esc(f.text||"")}</p>
      ${(f.images||[]).some(imgOk)?`<div class="fb-imgs">${f.images.map((u,i)=>imgOk(u)?`<button type="button" class="fb-img" data-act="fbimg" data-id="${esc(f.id)}" data-i="${i}" aria-label="Xem ảnh ${i+1} cỡ lớn"><img src="${u}" alt="Ảnh góp ý ${i+1}" loading="lazy"></button>`:"").join("")}</div>`:""}
      <div class="toolbar" style="margin-top:10px; justify-content:space-between">${S.canEdit?statusUI:"<div></div>"}${mine?`<div class="toolbar"><button class="btn" data-act="editfeedback" data-id="${esc(f.id)}">Sửa</button><button class="btn danger" data-act="delfeedback" data-id="${esc(f.id)}">Xoá</button></div>`:""}</div>
      </div></section>`;
  }).join("");
  return h;
}
/* f = góp ý đang sửa (bỏ trống = gửi mới). Sửa chỉ đổi loại/nội dung; gửi kèm lại status hiện có vì PUT ghi
   đè cả tài liệu (person/created_by/createdAt thì máy chủ tự giữ nguyên, xem server.js). */
function feedbackForm(f){
  openForm({title: f ? "Sửa góp ý" : "Gửi góp ý", subtitle: f ? (f.person||"") : (S.me || (S.user && S.user.display_name) || ""),
    values:{type: f ? (f.type||"Nhận xét") : "Nhận xét", text: f ? (f.text||"") : "", images: f ? [...(f.images||[])] : []},
    fields:[
      {key:"type", label:"Loại góp ý", type:"seg", options:FB_TYPES.map(t=>[t,t])},
      {key:"text", label:"Nội dung", type:"textarea", required:true, hint:()=>"Nhận xét về trải nghiệm dùng app, hoặc đề xuất tính năng/cải tiến cụ thể."},
      {key:"images", label:"Ảnh minh hoạ", type:"images", max:4, hint:()=>"Chụp màn hình rồi bấm Ctrl+V (dán) vào cửa sổ này – tối đa 4 ảnh, ảnh lớn sẽ tự thu nhỏ."}
    ],
    saveLabel: f ? "Lưu thay đổi" : "Gửi góp ý",
    onSave: async v => {
      if(!v.text.trim()) throw new Error("Nhập nội dung góp ý.");
      const images = (v.images||[]).filter(imgOk);
      if(f) await write("feedback/"+f.id, {type:v.type, text:v.text.trim(), images, ...(f.status?{status:f.status}:{})});
      else await write("feedback/"+uid("fb"), {type:v.type, text:v.text.trim(), images});
      toast(f ? "Đã lưu góp ý" : "Đã gửi góp ý");
    }
  });
}
ACTIONS["addfeedback"] = () => feedbackForm();
ACTIONS["editfeedback"] = el => { const f = S.feedback.find(x=>x.id===el.dataset.id); if(f) feedbackForm(f); };
ACTIONS["delfeedback"] = async el => { if(!confirm("Xoá góp ý này?")) return; await remove("feedback/"+el.dataset.id); toast("Đã xoá"); };
/* Đổi trạng thái xử lý – chỉ trưởng phòng bấm được (nút chỉ render khi S.canEdit, xem viewFeedback()).
   Gửi lại nguyên type/text hiện có vì PUT /api/doc/:coll/:id ghi đè toàn bộ tài liệu, không merge từng field. */
ACTIONS["fbstatus"] = async el => {
  const f = S.feedback.find(x=>x.id===el.dataset.id); if(!f) return;
  await write("feedback/"+f.id, {type:f.type, text:f.text, images:f.images||[], status:el.dataset.v});
};
/* Xem ảnh cỡ lớn: lớp phủ đơn giản, bấm ra ngoài / Esc để đóng */
ACTIONS["fbimg"] = el => {
  const f = S.feedback.find(x=>x.id===el.dataset.id), u = f && (f.images||[])[+el.dataset.i]; if(!imgOk(u)) return;
  const layer = document.getElementById("layer");
  const close = () => { layer.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if(e.key==="Escape") close(); };
  layer.innerHTML = `<div class="scrim" data-close></div><div class="fb-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh"><img src="${u}" alt="Ảnh góp ý"><button type="button" class="btn" data-close>Đóng</button></div>`;
  layer.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  document.addEventListener("keydown", onKey);
};
registerView({id:"feedback", label:"Góp ý",
  iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v12H8l-4 4V4z"/><path d="M8 9h8M8 13h5"/></svg>',
  render: viewFeedback, position:"bottom"});
