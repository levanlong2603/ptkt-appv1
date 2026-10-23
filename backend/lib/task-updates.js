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
    const changed = !before || explicit || (t.init.status||"") !== (before.init?.status||"");
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
    const changed = !sameTask || (before.status||"") !== (e.status||"");
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
module.exports = {stampProjectTasks, stampWeekEntries};
