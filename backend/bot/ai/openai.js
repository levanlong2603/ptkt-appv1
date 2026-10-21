"use strict";
/* OpenAI – gọi HTTP bằng fetch (không thêm thư viện), Chat Completions với response_format json_schema (strict).
   Chỉ dùng khi AI_PROVIDER=openai. Model đặt bằng AI_MODEL (bắt buộc nên đặt – tên model OpenAI đổi thường xuyên). */
const DEFAULT_MODEL = "gpt-4o-mini";

function createProvider({ apiKey, model }) {
  model = model || DEFAULT_MODEL;
  return {
    model,
    async parse(system, user, schema) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 30_000);
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            response_format: { type: "json_schema", json_schema: { name: "week_entry", strict: true, schema } },
          }),
          signal: ac.signal,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(j.error && j.error.message) || res.statusText}`);
        const msg = j.choices && j.choices[0] && j.choices[0].message;
        if (!msg || msg.refusal) throw new Error("OpenAI từ chối xử lý tin nhắn");
        return JSON.parse(msg.content);
      } finally { clearTimeout(t); }
    },
  };
}

module.exports = { createProvider };
