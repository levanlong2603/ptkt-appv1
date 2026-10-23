"use strict";
const {createHash}=require("crypto");
const {atomicDocs}=require("./atomic-docs");
const {slug}=require("./staff");
const {wlOf}=require("../../frontend/js/core/constants");
const revision=raw=>raw===null?null:createHash("sha256").update(raw).digest("hex");
const invalid=error=>({status:400,error});
const conflict=()=>({status:409,error:"Dữ liệu tuần hoặc deadline đã thay đổi ở nơi khác. Hãy sao chép nội dung cần giữ, tải lại và mở lại form."});
function validDate(value){
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d=new Date(value+"T00:00:00Z");
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;
}
async function saveWeekBundle(store,saveDoc,user,input){
  const doc=input?.document,updates=input?.deadlineUpdates||[];
  if(!doc || !validDate(doc.week) || new Date(doc.week+"T00:00:00Z").getUTCDay()!==1 ||
    typeof doc.person!=="string" || !doc.person.trim() || doc.person.length>200 ||
    !Array.isArray(doc.entries) || doc.entries.length>1000 || !Array.isArray(updates) || updates.length>100)
    return invalid("Dữ liệu tuần không hợp lệ.");
  const ctx=atomicDocs(store),id=doc.week+"__"+slug(doc.person),path="weeks/"+id;
  const raw=await ctx.store.getDoc(path),previous=raw?JSON.parse(raw):null;
  if((input.revision??null)!==revision(raw)) return conflict();
  const old=new Map((previous?.entries||[]).map(e=>[e.id,e]));
  const ids=new Set(),planned=new Set();let total=0;
  for(const e of doc.entries){
    if(!e || typeof e.id!=="string" || !e.id || ids.has(e.id) || typeof e.projectId!=="string" || typeof e.taskId!=="string" ||
      !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(e.projectId) || !e.taskId || e.taskId.length>200)
      return invalid("Mã đầu việc không hợp lệ hoặc bị trùng.");
    ids.add(e.id);
    if(!["","Đang làm","Đang vướng","Tạm dừng","Hoàn thành","Hủy"].includes(e.status||"")) return invalid("Trạng thái đầu việc không hợp lệ.");
    if(e.hours!=null && (typeof e.hours!=="number" || !Number.isFinite(e.hours) || e.hours<0.5 || e.hours>32))
      return invalid("Thời gian thực hiện phải từ 0,5 đến 32 giờ cho mỗi đầu việc.");
    if(e.hours==null && e.status && !(old.has(e.id)&&old.get(e.id).hours==null)) return invalid("Nhập giờ thực hiện cho đầu việc.");
    const projectRaw=await ctx.store.getDoc("projects/"+e.projectId),p=projectRaw?JSON.parse(projectRaw):null;
    if(!p) return invalid("Dự án không tồn tại. Hãy tải lại dữ liệu.");
    const key=e.projectId+"|"+e.taskId;
    if(p.type!=="Nội bộ"){
      if(!(p.tasks||[]).some(t=>t.id===e.taskId)) return invalid("Đầu việc không còn trong dự án.");
      if(planned.has(key)) return invalid("Một đầu việc chỉ được nhập một dòng trong tuần.");
      planned.add(key);
    } else if(e.taskName!=null && (typeof e.taskName!=="string" || !e.taskName.trim())) return invalid("Nhập tên đầu việc chung.");
    if(e.status!=="Hủy") total+=e.hours??wlOf(e.qm,e.pt)??0;
  }
  if(Math.round(total*10)/10>40) return invalid("Tổng thời gian thực hiện vượt capacity 40 giờ/tuần.");
  const body=JSON.parse(JSON.stringify({week:doc.week,person:doc.person,entries:doc.entries}));
  const weekError=await saveDoc(user,"weeks",id,body,undefined,ctx);
  if(weekError) return weekError;
  for(const update of updates){
    if(!update || !(update.deadline===null||validDate(update.deadline)) ||
      !(update.expectedDeadline===null||validDate(update.expectedDeadline)) ||
      !body.entries.some(e=>e.projectId===update.projectId && e.taskId===update.taskId)) return invalid("Deadline không hợp lệ.");
    const path="projects/"+update.projectId,raw=await ctx.store.getDoc(path),project=raw?JSON.parse(raw):null;
    const task=project?.tasks?.find(t=>t.id===update.taskId);
    if(!task) return invalid("Không tìm thấy đầu việc để cập nhật deadline.");
    if((task.deadline||null)!==update.expectedDeadline) return conflict();
    task.deadline=update.deadline;
    const err=await saveDoc(user,"projects",update.projectId,project,revision(raw),ctx);
    if(err) return err;
  }
  return await ctx.commit(user.username)?null:conflict();
}
module.exports={saveWeekBundle};
