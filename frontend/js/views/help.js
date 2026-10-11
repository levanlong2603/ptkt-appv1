"use strict";
/* Màn hình: help – nội dung do admin/trưởng phòng/phó phòng tự soạn trực tiếp trên giao diện (lưu ở
   config/help, cùng cơ chế với config/staff, config/catalog), không còn hard-code từng mục trong code.
   Soạn thảo kiểu rút gọn: 1 ô contenteditable + thanh công cụ In đậm / 3 mốc tiêu đề (lớn, nhỏ, đoạn văn
   thường) – đủ để dán nội dung từ nơi khác (vd ChatGPT soạn sẵn) rồi chỉnh lại, không cần rich-text đầy
   đủ kiểu Word. */
/* ================= VIEW: help ================= */
/* Nội dung mặc định khi config/help chưa có gì (lần đầu dùng tính năng này) – chuyển từ nội dung tĩnh cũ
   sang đúng khuôn in đậm/tiêu đề mới, để không mất hướng dẫn cũ; admin có thể sửa/viết lại tự do. */
const HELP_DEFAULT = `
<h2>Tài khoản</h2>
<p><b>Đăng nhập:</b> mỗi người dùng tài khoản riêng do trưởng phòng cấp. Nhân viên chỉ sửa được dữ liệu “Việc trong tuần” của chính mình.</p>
<p><b>Đổi mật khẩu / Đăng xuất:</b> bấm vào tên hoặc ảnh đại diện ở góc trên bên phải màn hình để mở menu tài khoản.</p>
<p><b>Thông báo:</b> nút chuông ở góc trên bên phải liệt kê các đầu việc đang vướng mắc trong tuần (nhân viên chỉ thấy của mình, trưởng phòng/phó phòng thấy của mọi người); bấm vào một dòng để mở thẳng việc đó ở “Việc trong tuần”.</p>
<p><b>Tự đăng xuất:</b> nếu không thao tác gì trong một khoảng thời gian, hệ thống tự đăng xuất. Bấm chuột, gõ phím hoặc cuộn trang để tính lại thời gian.</p>
<h2>Nhân viên · mỗi thứ 2, khoảng 10 phút</h2>
<p><b>1. Chọn tên:</b> chọn tên ở mục “Tôi là” dưới thanh bên (trình duyệt sẽ nhớ).</p>
<p><b>2. Việc trong tuần:</b> mở “Việc trong tuần”, chọn đúng tuần. Bấm “+ Thêm việc” cho mỗi đầu việc đã làm, hoặc “Chép việc dở dang từ tuần trước”.</p>
<p><b>3. Quy mô trong tuần:</b> chấm khối lượng phần việc làm trong tuần, chỉ để tham khảo.</p>
<p><b>4. Trạng thái cuối tuần:</b> Đang làm / Đang vướng / Tạm dừng / Hoàn thành / Hủy. Nếu vướng: chọn mức ma sát, nguyên nhân, ghi "Vướng mắc / cần ai hỗ trợ". Trạng thái tự cập nhật về Kế hoạch dự án.</p>
<p><b>Việc ngoài dự án:</b> hỗ trợ, việc phát sinh, đào tạo nội bộ — chọn dự án “Việc chung của phòng”.</p>
<h2>Trưởng phòng / Phó phòng</h2>
<p><b>Dự án mới:</b> “Kế hoạch dự án” → “+ Dự án mới”, chọn loại Triển khai / Thầu — hệ thống tự tạo sẵn đầu việc theo quy trình chuẩn của loại đó.</p>
<p><b>Kế hoạch dự án – ai thấy gì:</b> danh sách dự án lọc theo “Tôi là”; chọn “— Tất cả —” để thấy hết. Sửa được dự án nếu là người tạo, TM, SE, hoặc trưởng phòng/phó phòng; chỉ người tạo hoặc trưởng phòng/phó phòng xoá được cả dự án.</p>
<p><b>Mỗi tuần:</b> xem “Tải tuần” (ai quá tải, ai còn khả năng) và “Tổng quan dự án” (quá hạn, sắp đến hạn, tiến độ theo giai đoạn).</p>
<p><b>Đánh giá:</b> đầu việc hoàn thành có nhãn “Chờ đánh giá” — bấm vào để chấm đạt yêu cầu, chất lượng, tự chủ, nhận xét.</p>
<h3>Cách tính (tóm tắt)</h3>
<p><b>Workload:</b> ước lượng theo Quy mô × Độ phức tạp đầu việc — không phải thành tích.</p>
<p><b>Capacity:</b> Giờ/tuần × (1 − % họp, phát sinh) × hệ số năng lực.</p>
<p><b>Mức sử dụng tuần:</b> Workload / Capacity — dưới 80% còn khả năng, 80–100% theo dõi, trên 100% quá tải.</p>
<p><b>Ma sát:</b> cho biết vì sao việc không chạy — không dùng để đánh giá nhân viên.</p>
`.trim();
function helpSanitize(html){
  /* Chỉ FULL_ROLES ghi được config/help (RULES.config="admin" ở server.js) nên không coi là dữ liệu
     "không tin cậy" như input công khai – vẫn lọc bớt các thẻ/thuộc tính nguy hiểm cho chắc (phòng khi
     dán nhầm nội dung có script từ nơi khác), không dùng esc() vì cố ý cho phép thẻ định dạng (b/h2/h3/p). */
  return String(html||"")
    .replace(/<\/?(script|iframe|object|embed|style|link|meta|form)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}
function viewHelp(){
  const canEdit = S.canEdit;
  const editing = !!S.helpEdit;
  let h = `<div class="head"><div><h1>Hướng dẫn</h1></div>${canEdit && !editing ? `<button class="btn" data-act="helpedit">Sửa nội dung</button>` : ""}</div>`;
  if(editing){
    h += `<section class="panel"><div class="panel-b">
      <div class="toolbar" style="margin-bottom:10px; flex-wrap:wrap">
        <button type="button" class="btn" data-act="hcmd" data-cmd="bold"><b>In đậm</b></button>
        <button type="button" class="btn" data-act="hcmd" data-cmd="h2">Tiêu đề lớn</button>
        <button type="button" class="btn" data-act="hcmd" data-cmd="h3">Tiêu đề nhỏ</button>
        <button type="button" class="btn" data-act="hcmd" data-cmd="p">Đoạn văn thường</button>
      </div>
      <div id="helpEditor" class="help-editor" contenteditable="true">${S.help || HELP_DEFAULT}</div>
      <div class="toolbar" style="margin-top:12px; justify-content:flex-end">
        <button class="btn" data-act="helpcancel">Huỷ</button>
        <button class="btn primary" data-act="helpsave">Lưu</button>
      </div>
    </div></section>`;
  } else {
    h += `<section class="panel"><div class="panel-b help-view">${helpSanitize(S.help) || HELP_DEFAULT}</div></section>`;
  }
  return h;
}
ACTIONS["helpedit"] = () => { S.helpEdit = true; render(); };
ACTIONS["helpcancel"] = () => { S.helpEdit = false; render(); };
ACTIONS["helpsave"] = async () => {
  const el = document.getElementById("helpEditor"); if(!el) return;
  try{ await write("config/help", {html: helpSanitize(el.innerHTML)}); S.helpEdit = false; toast("Đã lưu hướng dẫn"); render(); }
  catch(e){}
};
/* Thanh công cụ thao tác trên vùng chọn (selection) của ô contenteditable – phải chặn mousedown trước để
   khỏi mất selection khi bấm nút (nút lấy focus làm contenteditable mất selection trước khi click chạy). */
document.getElementById("main").addEventListener("mousedown", e => { if(e.target.closest('[data-act="hcmd"]')) e.preventDefault(); });
ACTIONS["hcmd"] = el => {
  const ed = document.getElementById("helpEditor"); if(!ed) return;
  ed.focus();
  const cmd = el.dataset.cmd;
  if(cmd==="bold") document.execCommand("bold");
  else document.execCommand("formatBlock", false, cmd); // "h2" | "h3" | "p"
};

VIEW_RENDER.help = viewHelp;
