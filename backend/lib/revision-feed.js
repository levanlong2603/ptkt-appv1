"use strict";
const {createHash}=require("crypto");
/* Chỉ các collection web; không theo dõi các module KPI/Telegram đang tạm dừng. */
const WEB_COLLECTIONS=new Set(["config","projects","weeks","events","feedback","feedbackReply","worklog"]);
function createRevisionFeed(store,clock=Date.now){
  let cached=null,until=0,pending=null;
  return async function revisions(){
    if(cached && clock()<until) return cached;
    if(pending) return pending;
    pending=(async()=>{
      const rows=await store.getDocFingerprints([...WEB_COLLECTIONS]);
      const groups=Object.fromEntries([...WEB_COLLECTIONS].map(c=>[c,[]]));
      for(const row of rows) if(groups[row.collection]) groups[row.collection].push([row.path,row.digest]);
      const result={};
      for(const [collection,entries] of Object.entries(groups)){
        entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
        result[collection]=createHash("sha256").update(JSON.stringify(entries)).digest("hex");
      }
      cached=result;until=clock()+5000;return result;
    })();
    try{return await pending;} finally {pending=null;}
  };
}
module.exports={WEB_COLLECTIONS,createRevisionFeed};
