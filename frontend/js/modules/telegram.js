"use strict";
/* Module mở rộng: Liên kết Telegram + Lịch tự động của bot (máy chủ: backend/bot/, route /api/telegram/*).
   - Mọi tài khoản: menu tài khoản (góc trên phải) → "Liên kết Telegram" → lấy mã 1 lần (sống 10 phút) rồi nhắn bot
     "/start <mã>". Đã liên kết thì xem tên Telegram đang gắn và bỏ liên kết được.
   - Trưởng phòng/phó phòng/admin: thêm mục "Lịch tự động Telegram" – giờ nhắc nhập tuần, cảnh báo quá tải/vướng,
     tóm tắt tuần. Lưu ở config/telegram (quy tắc "admin" trong RULES), backend/bot/scheduler.js đọc lại mỗi lần chạy.
   Mở form qua tgOpen()/tgScheduleForm(), gọi từ ui.js (data-uact="tg" / "tgsched"). */
const TG_DOW = [[1,"Thứ 2"],[2,"Thứ 3"],[3,"Thứ 4"],[4,"Thứ 5"],[5,"Thứ 6"],[6,"Thứ 7"],[0,"Chủ nhật"]];
const tgBotLink = st => st.botUsername ? `<a href="https://t.me/${esc(st.botUsername)}" target="_blank" rel="noopener noreferrer">@${esc(st.botUsername)}</a>` : "bot Telegram của phòng";

async function tgOpen(){
  let st;
  try{ st = await S.db.api("GET", "/api/telegram/status"); }catch(e){ toast(e.message || "Không tải được trạng thái Telegram."); return; }
  if(!st.enabled){
    openForm({title:"Liên kết Telegram", values:{}, fields:[], readOnly:true,
      info:`<p>Bot Telegram chưa được cấu hình trên máy chủ. Nhờ quản trị viên đặt <code>TELEGRAM_BOT_TOKEN</code> (cả 2 máy) và <code>TELEGRAM_ENABLED=true</code> (1 máy) trong file <code>.env</code> rồi khởi động lại dịch vụ.</p>`});
    return;
  }
  if(st.linked){
    openForm({title:"Liên kết Telegram", subtitle:S.user.display_name, values:{}, fields:[], readOnly:true,
      info:`<p><span class="pill ok">Đã liên kết</span> ${st.tgName?`với <b>${esc(st.tgName)}</b>`:""}</p>
        <p>Nhắn ${tgBotLink(st)} lệnh <code>/nhap</code> để nhập việc trong tuần, <code>/tuannay</code> để xem lại.</p>`,
      extraBtn:{label:"Bỏ liên kết", onClick: async () => {
        if(!confirm("Bỏ liên kết Telegram? Bot sẽ không nhắn cho bạn nữa.")) return;
        try{ await S.db.api("DELETE", "/api/telegram/link"); toast("Đã bỏ liên kết Telegram"); }catch(e){ toast(e.message || "Không bỏ liên kết được."); }
      }}});
    return;
  }
  openForm({title:"Liên kết Telegram", subtitle:S.user.display_name, values:{}, fields:[], saveLabel:"Lấy mã liên kết",
    info:`<p>Liên kết để nhập việc trong tuần ngay trên Telegram và nhận lời nhắc tự động.</p>
      <ol style="padding-left:18px; line-height:1.7"><li>Bấm <b>Lấy mã liên kết</b> bên dưới.</li><li>Mở ${tgBotLink(st)} trên Telegram.</li><li>Gửi lệnh <code>/start MÃ</code> (mã có hiệu lực 10 phút, dùng 1 lần).</li></ol>`,
    onSave: async () => {
      let r;
      try{ r = await S.db.api("POST", "/api/telegram/link-code"); }catch(e){ throw new Error(e.message || "Không lấy được mã."); }
      // openForm đóng form sau onSave – mở form hiển thị mã ở lượt kế tiếp
      setTimeout(() => openForm({title:"Mã liên kết Telegram", values:{}, fields:[], readOnly:true,
        info:`<p>Gửi cho ${tgBotLink(r)} đúng tin nhắn sau (hiệu lực ${r.expiresInMin} phút):</p>
          <p style="font-size:22px; font-weight:700; letter-spacing:2px; margin:14px 0"><code>/start ${esc(r.code)}</code></p>
          ${r.botUsername?`<p><a class="btn primary" href="https://t.me/${esc(r.botUsername)}?start=${esc(r.code)}" target="_blank" rel="noopener noreferrer">Mở Telegram và liên kết ngay</a></p>`:""}`}), 0);
    }});
}

async function tgScheduleForm(){
  let st;
  try{ st = await S.db.api("GET", "/api/telegram/status"); }catch(e){ toast(e.message || "Không tải được cấu hình."); return; }
  const c = st.schedule; if(!c) return;
  const timeOk = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t||"");
  openForm({title:"Lịch tự động Telegram",
    subtitle: st.enabled ? "Theo giờ máy chủ" : "Bot chưa bật trên máy chủ – lịch sẽ áp dụng khi bật",
    values:{rOn:c.remind.on, rDow:c.remind.dow, rTime:c.remind.time, aOn:c.alert.on, aTime:c.alert.time, sOn:c.summary.on, sDow:c.summary.dow, sTime:c.summary.time},
    fields:[
      {heading:"Nhắc nhập tuần"},
      {key:"rOn", label:"Nhắc người chưa nhập việc tuần này", type:"check"},
      {key:"rDow", label:"Ngày", type:"select", options:TG_DOW, half:true},
      {key:"rTime", label:"Giờ (HH:MM)", type:"text", half:true},
      {heading:"Cảnh báo quá tải / vướng"},
      {key:"aOn", label:"Báo trưởng/phó phòng: người quá tải và việc mới chuyển “Đang vướng”", type:"check", hint:"Chạy Thứ 2 – Thứ 6. Không có gì mới thì không nhắn."},
      {key:"aTime", label:"Giờ (HH:MM)", type:"text"},
      {heading:"Tóm tắt cuối tuần"},
      {key:"sOn", label:"Gửi tóm tắt tuần cho trưởng/phó phòng", type:"check"},
      {key:"sDow", label:"Ngày", type:"select", options:TG_DOW, half:true},
      {key:"sTime", label:"Giờ (HH:MM)", type:"text", half:true},
    ],
    onSave: async v => {
      for(const t of [v.rTime, v.aTime, v.sTime]) if(!timeOk(t)) throw new Error(`Giờ “${t}” không đúng dạng HH:MM (vd 15:00).`);
      await write("config/telegram", {
        remind:{on:!!v.rOn, dow:+v.rDow, time:v.rTime}, alert:{on:!!v.aOn, time:v.aTime}, summary:{on:!!v.sOn, dow:+v.sDow, time:v.sTime},
      });
      toast("Đã lưu lịch tự động");
    }});
}
