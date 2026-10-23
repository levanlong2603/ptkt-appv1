"use strict";
/* Hàm tiện ích: ngày tháng, định dạng số, escape HTML, lưu tuỳ chọn trình duyệt */
/* ================= utils ================= */
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function todayISO(){ const d=new Date(); return iso(d); }
function iso(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function parse(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(s,n){ const d=parse(s); d.setDate(d.getDate()+n); return iso(d); }
function mondayOf(s){ const d=parse(s); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return iso(d); }
function isoWeek(s){ const d=parse(s); d.setDate(d.getDate()+3-((d.getDay()+6)%7)); const w1=new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w1)/864e5-3+((w1.getDay()+6)%7))/7); }
function dm(s){ if(!s) return "–"; const [y,m,d]=s.split("-"); return d+"/"+m; }
function dmy(s){ if(!s) return "–"; const [y,m,d]=s.split("-"); return d+"/"+m+"/"+y; }
function days(a,b){ return Math.round((parse(b)-parse(a))/864e5); }
function slug(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || "x"; }
function uid(p){ return p + Math.random().toString(36).slice(2,9); }
function pct(x){ return x==null||isNaN(x) ? "–" : Math.round(x*100)+"%"; }
function fmt1(x){ return x==null ? "–" : (Math.round(x*10)/10).toLocaleString("vi-VN"); }
function completionBadge(status,completedOn,deadline){
  if(status!=="Hoàn thành") return "";
  const result=completionTiming(completedOn,deadline);
  return `<span class="pill ${result.tone}" title="${esc(completedOn?"Hoàn thành thực tế: "+dmy(completedOn):"Nhập ngày hoàn thành thực tế để đánh giá sớm/trễ hạn")}">${esc(result.label)}</span>`;
}
function completionSummaryHtml(tasks,weeks,person){
  const period=new Set(weeks);
  const completed=tasks.filter(t=>t.p?.type!=="Nội bộ" && t.status==="Hoàn thành" && t.done && period.has(t.done) && (!person||t.doers?.includes(person)||tOwners(t).includes(person)));
  const early=completed.filter(t=>t.completion?.days>0).length;
  const ontime=completed.filter(t=>t.completion?.days===0).length;
  const late=completed.filter(t=>t.completion?.days<0).length;
  return `<div class="toolbar" style="gap:8px; flex-wrap:wrap"><span class="small muted">Đầu việc dự án hoàn thành so với hạn:</span><span class="pill ok">Sớm ${early}</span><span class="pill info">Đúng hạn ${ontime}</span><span class="pill bad">Trễ ${late}</span><span class="pill mute">Chưa đủ ngày/hạn ${completed.length-early-ontime-late}</span></div>`;
}
function phaseOf(dv){ const m=/^([0-9A-Z]{1,2}\d?)\./.exec(dv||""); return m ? m[1] : ""; }
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; t.setAttribute("role","status"); document.body.appendChild(t); setTimeout(()=>t.remove(),2400); }


function store(k, v){ try{ if(v===undefined) return localStorage.getItem("ptkt."+k); localStorage.setItem("ptkt."+k, v); }catch(e){ return null; } }
/* Cho máy chủ (Node) dùng lại đúng các hàm ngày tháng/slug này khi tính KPI lúc chốt kỳ (modules/kpi-calc.js);
   trên trình duyệt `module` không tồn tại nên dòng này không làm gì. */
if(typeof module!=="undefined" && module.exports) module.exports = {iso, parse, addDays, mondayOf, slug};
