"use strict";
/* /gopy và /nhatky – ghi đúng định dạng của 2 module web:
   - Góp ý (frontend/js/modules/feedback.js): feedback/<uid "fb"> = {type, text, images:[]}; máy chủ (saveDoc) tự ghi
     created_by / person / createdAt. Quy tắc "own": ai cũng tạo mới được.
   - Nhật ký (frontend/js/modules/worklog.js – saveWorklogDays): worklog/<thứ 2>__<slug tên> = {week, person, days:[{date, text}]};
     bot NỐI thêm vào ngày hôm nay (đã có nội dung thì xuống dòng), không đụng các ngày khác. Quy tắc "own-week". */
module.exports = core => {
  const { h, cut, btn, cancelRow, rbtn, tg, getJSON, ctx, W } = core;
  const FB_TYPES = ["Nhận xét", "Yêu cầu cải tiến"];

  /* ---------- /gopy ---------- */
  const feedbackFlow = {
    title: () => "Xác nhận gửi góp ý",
    next: d => !d.type ? "type" : !d.text ? "text" : "confirm",
    card: s => [s.d.type && `Loại: <b>${h(s.d.type)}</b>`, s.d.text && h(s.d.text)].filter(Boolean).join("\n"),
    view(s, pre) {
      if (s.step === "type") return { text: "<b>Gửi góp ý</b> cho ứng dụng / phòng\nChọn loại:", kb: [FB_TYPES.map((t, i) => btn(s, t, "ty", i)), cancelRow(s)] };
      return { text: pre + "Gõ <b>nội dung góp ý</b>:", kb: [cancelRow(s)] };
    },
    async onPick(chatId, s, act, arg) {
      if (act !== "ty") return false;
      s.d.type = FB_TYPES[Number(arg)]; await core.goNext(chatId, s); return true;
    },
    onText(s, text) { if (s.step !== "text") return undefined; s.d.text = text.trim().slice(0, 4000); return null; },
    editFields: () => [["Loại", "type"], ["Nội dung", "text"]],
    async commit(s) {
      const err = await ctx.saveDoc(s.user, "feedback", core.uid("fb"), { type: s.d.type, text: s.d.text, images: [] });
      if (err) return { error: err.error };
      return { text: "✅ <b>Đã gửi góp ý</b> – xem và theo dõi trạng thái xử lý ở mục Góp ý trên web. Cảm ơn bạn!" };
    },
  };

  /* ---------- /nhatky ---------- */
  const docIdOf = (wk, person) => `${wk}__${core.slug(person)}`;
  const worklogFlow = {
    title: () => `Xác nhận ghi nhật ký ${core.dm(W.todayISO())}`,
    next: d => !d.text ? "text" : "confirm",
    card: s => s.d.text ? `📝 ${h(s.d.text)}` + (s.prev ? `\n\n<i>Sẽ nối tiếp sau nội dung đã ghi hôm nay.</i>` : "") : "",
    view: s => ({
      text: `<b>Nhật ký hôm nay (${core.dm(W.todayISO())})</b>\n` + (s.prev ? `Đã ghi:\n${h(cut(s.prev, 2500))}\n\n` : "<i>Chưa ghi gì.</i>\n\n") + "Gõ <b>nội dung</b> cần ghi thêm:",
      kb: [cancelRow(s)],
    }),
    onPick: async () => false,
    onText(s, text) { if (s.step !== "text") return undefined; s.d.text = text.trim().slice(0, 4000); return null; },
    editFields: () => [["Nội dung", "text"]],
    async commit(s) {
      const who = s.user.staff_name, wk = ctx.mondayOfToday(), date = W.todayISO();
      const doc = await getJSON(`worklog/${docIdOf(wk, who)}`);
      const days = doc ? [...(doc.days || [])] : [], i = days.findIndex(d => d.date === date);
      if (i >= 0) days[i] = { ...days[i], text: days[i].text ? `${days[i].text}\n${s.d.text}` : s.d.text };
      else days.push({ date, text: s.d.text });
      days.sort((a, b) => a.date.localeCompare(b.date));
      const err = await ctx.saveDoc(s.user, "worklog", docIdOf(wk, who), { week: wk, person: who, days });
      if (err) return { error: err.error };
      return { text: `✅ <b>Đã ghi nhật ký</b> ngày ${core.dm(date)} – xem ở Nhập theo tuần → Nhật ký trên web.` };
    },
  };
  async function cmdNhatKy(chatId, user) {
    if (!user.staff_name) return tg.send(chatId, "Tài khoản chưa gắn với nhân sự nào nên chưa ghi nhật ký được.");
    const doc = await getJSON(`worklog/${docIdOf(ctx.mondayOfToday(), user.staff_name)}`);
    const s = core.startFlow(chatId, user, null, "worklog");
    s.prev = ((doc && doc.days || []).find(d => d.date === W.todayISO()) || {}).text || "";
    await core.goNext(chatId, s, "send");
  }

  return {
    flows: { feedback: feedbackFlow, worklog: worklogFlow },
    commands: [
      { name: "nhatky", desc: "Ghi nhật ký làm việc hôm nay", run: cmdNhatKy },
      { name: "gopy", desc: "Gửi góp ý / yêu cầu cải tiến", run: async (chatId, user) => { const s = core.startFlow(chatId, user, null, "feedback"); await core.goNext(chatId, s, "send"); } },
    ],
    handlers: {},
    statics: {},
  };
};
