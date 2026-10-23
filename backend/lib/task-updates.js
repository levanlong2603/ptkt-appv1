"use strict";
/* Mốc cập nhật do máy chủ cấp, không tin đồng hồ trình duyệt hay ngày sửa của file Excel. */
function comparable(row){
  const copy = {...row};
  delete copy.updatedAt; delete copy.updatedBy;
  delete copy.statusUpdatedAt; delete copy.statusUpdatedBy;
  return JSON.stringify(copy);
}
function stampProjectTasks(body, previous, username, now=Date.now()){
  const old = new Map((previous?.tasks||[]).map(t=>[t.id,t]));
  for(const t of body.tasks||[]){
    const before = old.get(t.id), explicit = t._statusChanged === true;
    delete t._statusChanged;
    t.init = {...(t.init||{})};
    const changed = !before || explicit || (t.init.status||"") !== (before.init?.status||"") || (t.init.completedOn||null)!==(before.init?.completedOn||null);
    if(changed && t.init.status){
      t.init.statusUpdatedAt = now; t.init.statusUpdatedBy = username;
      t.init.source = !before && t.init.source==="excel" ? "excel" : "project";
    } else {
      delete t.init.statusUpdatedAt; delete t.init.statusUpdatedBy;
      if(before?.init?.statusUpdatedAt) t.init.statusUpdatedAt = before.init.statusUpdatedAt;
      if(before?.init?.statusUpdatedBy) t.init.statusUpdatedBy = before.init.statusUpdatedBy;
    }
    if(!before || comparable(t)!==comparable(before)){
      t.updatedAt = now; t.updatedBy = username;
    } else {
      delete t.updatedAt; delete t.updatedBy;
      if(before.updatedAt) t.updatedAt=before.updatedAt;
      if(before.updatedBy) t.updatedBy=before.updatedBy;
    }
  }
}
function stampWeekEntries(body, previous, username, now=Date.now()){
  const old = new Map((previous?.entries||[]).map(e=>[e.id,e]));
  for(const e of body.entries||[]){
    const before = old.get(e.id);
    const sameTask = before && before.projectId===e.projectId && before.taskId===e.taskId;
    if(e.status==="Hoàn thành"&&!e.completedOn&&(!sameTask||before.status!=="Hoàn thành")){
      e.completedOn=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
    }
    const changed = !sameTask || (before.status||"") !== (e.status||"") || (before.completedOn||null)!==(e.completedOn||null);
    delete e.statusUpdatedAt; delete e.statusUpdatedBy;
    if(changed && e.status){ e.statusUpdatedAt=now; e.statusUpdatedBy=username; }
    else if(sameTask){
      if(before.statusUpdatedAt) e.statusUpdatedAt=before.statusUpdatedAt;
      if(before.statusUpdatedBy) e.statusUpdatedBy=before.statusUpdatedBy;
    }
    if(!sameTask || comparable(e)!==comparable(before)){ e.updatedAt=now; e.updatedBy=username; }
    else {
      delete e.updatedAt; delete e.updatedBy;
      if(before.updatedAt) e.updatedAt=before.updatedAt;
      if(before.updatedBy) e.updatedBy=before.updatedBy;
    }
  }
}
function validateCompletionDates(body,coll,now=Date.now()){
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  const rows=coll==="projects"?(body.tasks||[]).map(t=>t.init).filter(Boolean):body.entries||[];
  for(const row of rows){
    if(row.status!=="Hoàn thành"){delete row.completedOn;continue;}
    if(!row.completedOn){delete row.completedOn;continue;}
    const value=row.completedOn,d=typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+"T00:00:00Z"):null;
    if(!d || !Number.isFinite(+d) || d.toISOString().slice(0,10)!==value || value>today)
      return {status:400,error:"Ngày hoàn thành thực tế không hợp lệ hoặc nằm trong tương lai."};
  }
  return null;
}
module.exports = {stampProjectTasks, stampWeekEntries,validateCompletionDates};
