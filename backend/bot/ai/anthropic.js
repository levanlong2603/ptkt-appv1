"use strict";
/* Claude (Anthropic) qua SDK chính thức @anthropic-ai/sdk – chỉ nạp khi AI_PROVIDER=anthropic.
   - Structured outputs (output_config.format json_schema): Claude trả đúng JSON theo lược đồ.
   - effort "low": việc trích xuất ngắn, không cần suy luận sâu → nhanh và rẻ hơn.
   - fallbacks "default" (beta server-side-fallback-2026-07-01): nếu model từ chối vì bộ lọc an toàn, máy chủ
     Anthropic tự chạy lại trên model dự phòng trong cùng lời gọi.
   Mặc định model claude-opus-5-5; muốn rẻ hơn nhiều cho việc đơn giản này thì đặt AI_MODEL=claude-haiku-5-5
   (khi đó nên bỏ fallbacks – Haiku không có fallback phía máy chủ, xem FALLBACK_MODELS). */
const Anthropic = require("@anthropic-ai/sdk");
const Client = Anthropic.default || Anthropic;

const DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

function createProvider({ apiKey, model }) {
  const client = new Client({ apiKey, timeout: 30_000, maxRetries: 1 });
  model = model || DEFAULT_MODEL;
  const fb = FALLBACK_MODELS.has(model);
  return {
    model,
    async parse(system, user, schema) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 2000,
        ...(fb ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal") throw new Error("Claude từ chối xử lý tin nhắn" + (res.stop_details && res.stop_details.category ? ` (${res.stop_details.category})` : ""));
      if (res.stop_reason === "max_tokens") throw new Error("Phản hồi bị cắt (max_tokens)");
      const text = res.content.filter(b => b.type === "text").map(b => b.text).join("");
      return JSON.parse(text);
    },
  };
}

module.exports = { createProvider };
