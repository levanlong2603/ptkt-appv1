"use strict";
/* Lớp AI đa hãng cho bot: đọc 1 câu tự do của nhân viên → BẢN NHÁP lượt nhập tuần. Không bao giờ tự ghi – flows.js
   lọc lại mọi giá trị theo danh sách hợp lệ rồi luôn đưa qua bước Xác nhận (Đồng ý / Sửa / Huỷ).
   Chọn hãng trong .env (đổi hãng = đổi 3 dòng, không sửa code):
     AI_PROVIDER=none | anthropic | openai
     AI_API_KEY=...            (khoá API của hãng tương ứng)
     AI_MODEL=...              (tuỳ chọn; mặc định theo từng hãng, xem anthropic.js / openai.js)
   Thêm hãng mới: tạo <hãng>.js export createProvider({apiKey, model}) → { parse(system, user, schema) → object }
   rồi khai báo trong PROVIDERS bên dưới. Dữ liệu gửi đi: câu nhắn + tên dự án/đầu việc người đó được nhập. */

const PROVIDERS = { anthropic: "./anthropic", openai: "./openai" };

/* Lược đồ JSON bản nháp – mọi trường bắt buộc có mặt, không rõ thì null (đúng yêu cầu structured outputs) */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "taskId", "hours", "status", "ms", "nn", "work", "note"],
  properties: {
    projectId: { type: ["string", "null"], description: "id dự án lấy đúng từ danh sách, hoặc null" },
    taskId: { type: ["string", "null"], description: "id đầu việc thuộc dự án đó, hoặc null" },
    hours: { type: ["number", "null"], description: "số giờ thực hiện, hoặc null nếu không nói" },
    status: { type: ["string", "null"], description: "một trong danh sách trạng thái, hoặc null" },
    ms: { type: ["integer", "null"], description: "mức ma sát 1-5 nếu đang vướng, hoặc null" },
    nn: { type: ["string", "null"], description: "nguyên nhân vướng, một trong danh sách, hoặc null" },
    work: { type: ["string", "null"], description: "việc đã làm, viết gọn bằng tiếng Việt" },
    note: { type: ["string", "null"], description: "vướng mắc / cần ai hỗ trợ, nếu có" },
  },
};

const SYSTEM = [
  "Bạn đọc tin nhắn tiếng Việt của một kỹ sư báo cáo việc đã làm trong tuần và chuyển thành JSON theo lược đồ.",
  "Chỉ dùng projectId/taskId có trong danh sách được cung cấp; khớp theo tên gần đúng, viết tắt, không dấu. Không chắc thì để null.",
  "status phải là một giá trị trong danh sách trạng thái; nn phải là một giá trị trong danh sách nguyên nhân. Không rõ thì null.",
  "Trạng thái gợi ý: 'xong/hoàn thành' → Hoàn thành; 'đang làm/tiếp tục' → Đang làm; 'vướng/kẹt/chờ' → Đang vướng; 'tạm dừng/hoãn' → Tạm dừng.",
  "hours là số giờ (vd '2 tiếng rưỡi' → 2.5, 'nửa ngày' → 4, '1 ngày' → 8). Không nói thì null.",
  "work: tóm tắt ngắn việc đã làm. note: chỉ điền nếu có vướng mắc hoặc cần hỗ trợ.",
  "Không bịa thông tin không có trong tin nhắn.",
].join("\n");

function createAI(env) {
  const provider = String(env.AI_PROVIDER || "none").toLowerCase();
  if (provider === "none" || !PROVIDERS[provider]) {
    if (provider !== "none") console.error(`[bot/ai] AI_PROVIDER="${provider}" không hỗ trợ (chỉ: none, ${Object.keys(PROVIDERS).join(", ")}) – tắt AI.`);
    return { enabled: false };
  }
  if (!env.AI_API_KEY) { console.error("[bot/ai] Thiếu AI_API_KEY – tắt AI."); return { enabled: false }; }
  let impl;
  try { impl = require(PROVIDERS[provider]).createProvider({ apiKey: env.AI_API_KEY, model: env.AI_MODEL || "" }); }
  catch (e) { console.error(`[bot/ai] Không khởi tạo được "${provider}":`, e.message); return { enabled: false }; }
  return {
    enabled: true,
    provider: `${provider}/${impl.model}`,
    /* ctx: { projects:[{id,name,tasks:[{id,name}]}], statuses, causes, today } */
    async parse(text, ctx) {
      const user = [
        `Hôm nay: ${ctx.today}`,
        `Trạng thái hợp lệ: ${JSON.stringify(ctx.statuses)}`,
        `Nguyên nhân hợp lệ: ${JSON.stringify(ctx.causes)}`,
        `Dự án và đầu việc được nhập (JSON): ${JSON.stringify(ctx.projects)}`,
        "",
        `Tin nhắn: """${String(text).slice(0, 2000)}"""`,
      ].join("\n");
      return impl.parse(SYSTEM, user, SCHEMA);
    },
  };
}

module.exports = { createAI };
