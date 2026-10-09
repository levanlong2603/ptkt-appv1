"use strict";
/* Màn hình: help */
/* ================= VIEW: help ================= */
function viewHelp(){
  const sec = (t, rows) => `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>${t}</h2></div><div class="panel-b"><dl class="kv" style="grid-template-columns:190px 1fr; gap:10px 16px">${rows.map(r=>`<dt style="font-weight:600;color:var(--ink)">${r[0]}</dt><dd>${r[1]}</dd>`).join("")}</dl></div></section>`;
  return `<div class="head"><div><h1>Hướng dẫn</h1></div></div>` +
  (S.server ? sec("Tài khoản", [
    ["Đăng nhập", "Mỗi người dùng tài khoản riêng do trưởng phòng cấp. Nhân viên chỉ sửa được dữ liệu “Nhập theo tuần” của chính mình."],
    ["Đổi mật khẩu", "Bấm “Đổi mật khẩu” ở góc dưới thanh bên."],
    ["Tự đăng xuất", `Nếu không thao tác gì trong ${IDLE_TIMEOUT_MIN} phút, hệ thống tự đăng xuất. Bấm chuột, gõ phím hoặc cuộn trang để tính lại thời gian.`]]) : "") + (S.local ? sec("Bản chạy trên máy", [
    ["Lưu ở đâu", "Dữ liệu lưu trong trình duyệt của máy đang mở file. Đóng file, mở lại vẫn còn (nếu dùng cùng trình duyệt và không xoá lịch sử)."],
    ["Chuyển / gộp dữ liệu", "Cài đặt → “Xuất sao lưu (.json)”, gửi file cho người khác, họ chọn “Nhập sao lưu…”. Nhập sao lưu sẽ thay toàn bộ dữ liệu trên máy đó."],
    ["Xuất Excel", "Cài đặt → “Xuất Excel: kế hoạch dự án” hoặc “Xuất Excel: nhập theo tuần”."]]) : "") +
  sec("Nhân viên · mỗi thứ 2, khoảng 10 phút", [
    ["1. Chọn tên", "Chọn tên ở mục “Tôi là” dưới thanh bên (trình duyệt sẽ nhớ)."],
    ["2. Nhập theo tuần", "Mở “Nhập theo tuần”, chọn đúng tuần. Bấm “+ Thêm việc” cho mỗi đầu việc đã làm, hoặc “Chép việc dở dang từ tuần trước”."],
    ["3. Quy mô trong tuần", "Chấm khối lượng phần việc làm trong tuần: 1 = 0,5–2h · 2 = 2–8h · 3 = 8–24h · 4 = trên 24h · 5 = cả tuần."],
    ["4. Trạng thái cuối tuần", "Đang làm / Đang vướng / Tạm dừng / Hoàn thành / Hủy. Nếu vướng: chọn ma sát, nguyên nhân, ghi cần ai hỗ trợ. Trạng thái tự cập nhật về kế hoạch dự án."],
    ["Việc ngoài dự án", "Hỗ trợ, việc phát sinh, đào tạo nội bộ: chọn dự án “Việc chung của phòng”."]]) +
  sec("Trưởng phòng", [
    ["Dự án mới", "Chỉ trưởng phòng: “Kế hoạch dự án” → “+ Dự án mới”, chọn loại Triển khai / Thầu — hệ thống tự tạo sẵn toàn bộ đầu việc theo quy trình chuẩn của loại đó."],
    ["Kế hoạch dự án – ai thấy gì", "Danh sách dự án lọc theo “Tôi là” ở góc dưới thanh bên: chọn một người thì chỉ thấy dự án người đó là TM (phụ trách) hoặc SE. Trưởng phòng chọn “— Tất cả —” để thấy hết. Sửa được dự án (kể cả thêm/sửa/xoá đầu việc) nếu là người tạo, TM, SE, hoặc trưởng phòng; chỉ người tạo hoặc trưởng phòng xoá được cả dự án. Muốn xem toàn bộ dự án của phòng mà không đổi “Tôi là” (chỉ xem, không sửa), vào “Tổng quan dự án”."],
    ["Lập kế hoạch", "Bấm từng đầu việc để điền người phụ trách, deadline theo HĐ, ưu tiên. Quy mô và độ phức tạp để “Chuẩn” nếu không có gì khác thường."],
    ["Mỗi tuần", "Xem “Tải tuần” (ai quá tải, ai còn khả năng, việc bị vướng) và “Tổng quan dự án” (quá hạn, sắp đến hạn, tiến độ theo giai đoạn)."],
    ["Đánh giá", "Đầu việc hoàn thành có nhãn “Chờ đánh giá” – bấm vào để chấm đạt yêu cầu, chất lượng, tự chủ, nhận xét."],
    ["Cài đặt", "Sửa nhân sự & capacity, đầu việc chuẩn của 3 quy trình."]]) +
  sec("Cách tính", [
    ["Workload", "Quy mô × Độ phức tạp (mỗi yếu tố 1–5). Workload không phải là thành tích."],
    ["Capacity", "40 giờ × (1 − 20% họp, phát sinh) × hệ số năng lực ≈ 32 điểm/tuần."],
    ["Mức sử dụng tuần", "Workload tuần / Capacity: dưới 80% còn khả năng · 80–100% theo dõi · trên 100% quá tải."],
    ["Tiến độ dự án", "Workload các đầu việc hoàn thành / tổng workload của dự án. Thanh giai đoạn cho biết % hoàn thành của từng giai đoạn."],
    ["Trạng thái đầu việc", "Lấy từ lần nhập tuần mới nhất; nếu chưa có thì dùng trạng thái ban đầu."],
    ["Ma sát", "Cho biết vì sao việc không chạy – không dùng để đánh giá nhân viên."]]);
}


VIEW_RENDER.help = viewHelp;
