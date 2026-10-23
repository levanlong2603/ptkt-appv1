"use strict";
/* Chuẩn bị dữ liệu qua saveDoc, chỉ ghi một lần trong giao dịch; phát SSE sau khi commit. */
function atomicDocs(store){
  const snapshots=new Map(),changes=new Map(),effects=[];
  const staged={
    async getDoc(path){
      if(changes.has(path)) return changes.get(path).body;
      if(!snapshots.has(path)) snapshots.set(path,await store.getDoc(path));
      return snapshots.get(path);
    },
    async upsertDoc(path,collection,id,body){
      if(!snapshots.has(path)) await staged.getDoc(path);
      changes.set(path,{path,collection,id,body,expected:snapshots.get(path)});
    },
    async compareAndSwapDoc(path,collection,id,expected,body){
      if(await staged.getDoc(path)!==expected) return false;
      await staged.upsertDoc(path,collection,id,body); return true;
    }
  };
  return {store:staged,effects,
    async commit(username){
      if(!await store.commitDocs([...changes.values()],username)) return false;
      for(const effect of effects) effect();
      return true;
    }
  };
}
module.exports={atomicDocs};
