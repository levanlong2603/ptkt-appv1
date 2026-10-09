"use strict";
/* Module mở rộng: Góp ý – mọi người gửi nhận xét/yêu cầu cải tiến, hiển thị theo tên nhân sự.
   Quyền ghi: RULES.feedback = "own" (backend/server.js) – ai cũng tạo mới được; sửa/xoá thì chỉ
   người tạo hoặc trưởng phòng. Trường person/created_by/createdAt luôn do máy chủ ghi (xem route
   PUT /api/doc/:coll/:id trong server.js), không nhận từ client. */
const FB_TYPES = ["Nhận xét", "Yêu cầu cải tiến"];
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
  let h = `<div class="head"><div><h1>Góp ý</h1><div class="sub">Nhận xét và yêu cầu cải tiến cho ứng dụng</div></div>
    <button class="btn primary" data-act="addfeedback">+ Gửi góp ý</button></div>`;
  if(!S.feedback.length) return h + `<section class="panel"><div class="empty"><b>Chưa có góp ý nào</b>Bấm "+ Gửi góp ý" để gửi nhận xét hoặc đề xuất cải tiến đầu tiên.</div></section>`;
  h += S.feedback.map(f => {
    const mine = S.user && (f.created_by===S.user.username || S.canEdit);
    const tcls = f.type==="Yêu cầu cải tiến" ? "info" : "mute";
    return `<section class="panel" style="margin-bottom:12px"><div class="panel-b">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
        <b>${esc(f.person||"–")}</b><span class="pill ${tcls}">${esc(f.type||"Nhận xét")}</span>
        <span class="small muted" style="margin-left:auto">${f.createdAt?dmy(f.createdAt.slice(0,10)):"–"}</span></div>
      <p style="white-space:pre-wrap; margin:10px 0 0">${esc(f.text||"")}</p>
      ${mine?`<div class="toolbar" style="margin-top:10px"><button class="btn danger" data-act="delfeedback" data-id="${esc(f.id)}">Xoá</button></div>`:""}
      </div></section>`;
  }).join("");
  return h;
}
function feedbackForm(){
  openForm({title:"Gửi góp ý", subtitle: S.me || (S.user && S.user.display_name) || "",
    values:{type:"Nhận xét", text:""},
    fields:[
      {key:"type", label:"Loại góp ý", type:"seg", options:FB_TYPES.map(t=>[t,t])},
      {key:"text", label:"Nội dung", type:"textarea", required:true, hint:()=>"Nhận xét về trải nghiệm dùng app, hoặc đề xuất tính năng/cải tiến cụ thể."}
    ],
    saveLabel:"Gửi góp ý",
    onSave: async v => {
      if(!v.text.trim()) throw new Error("Nhập nội dung góp ý.");
      await write("feedback/"+uid("fb"), {type:v.type, text:v.text.trim()});
      toast("Đã gửi góp ý");
    }
  });
}
ACTIONS["addfeedback"] = () => feedbackForm();
ACTIONS["delfeedback"] = async el => { if(!confirm("Xoá góp ý này?")) return; await remove("feedback/"+el.dataset.id); toast("Đã xoá"); };
registerView({id:"feedback", label:"Góp ý",
  iconSvg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v12H8l-4 4V4z"/><path d="M8 9h8M8 13h5"/></svg>',
  render: viewFeedback, position:"bottom"});
