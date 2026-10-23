const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
  const c=vm.createContext({S:{week:'2026-10-19',period:'week',staff:[{name:'An'}],catalog:[],projects:[{id:'p1',name:'Project',type:'Triển khai',owners:['An'],tasks:[{id:'t1',dv:'Task',owners:['An'],qm:5,init:{status:'Đang làm'}}]}],weeks:[]},
    effectiveSimAs:()=>null,scopeToggleHtml:()=>'',main:{addEventListener(){}},document:{addEventListener(){}},stPill:x=>x});
  for(const file of ['core/utils','core/constants','core/model','views/exec-dashboard','modules/reports'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',file+'.js'),'utf8'),c);
  return c;
}
const doc=(week,hours,qm)=>({week,person:'An',entries:[{id:'e1',projectId:'p1',taskId:'t1',hours,qm,status:'Đang làm'}]});
function table(c){vm.runInContext('M=derive()',c);const html=c.viewExec(),start=html.indexOf('CÔNG VIỆC ĐANG THỰC HIỆN');return html.slice(start,html.indexOf('</table>',start));}
test('dashboard displays recorded hours for selected period instead of project scale estimate',()=>{
  const c=setup();c.S.weeks=[doc('2026-10-12',9),doc('2026-10-19',2)];
  const html=table(c);assert(html.includes('Thời gian thực hiện'));assert(html.includes('<b>2 giờ</b>'));
  assert(!html.includes('<b>28'));assert(!html.includes('<b>9 giờ'));assert(!html.includes('Workload'));
  c.S.weeks=[];assert(!table(c).includes('<b>28'));
});
test('legacy weekly time is explicitly estimated and cancelled entries do not count',()=>{
  const c=setup();c.S.weeks=[doc('2026-10-19',null,2)];
  const html=table(c);assert(html.includes('<b>5 giờ</b>'));assert(html.includes('Có ước lượng'));
  const summary=c.executionTimeOf([{hours:2,status:'Đang làm'},{hours:20,status:'Hủy'},{hours:null,wl:5}]);
  assert.equal(summary.hours,7);assert.equal(summary.estimated,true);
  assert.equal(c.executionTimeOf([]),null);
});
test('report preview merges hours and workload, marking legacy estimates',()=>{
  const c=setup();const report={showPerson:false,rows:[{common:true,name:'Common',detail:'Work',hours:2,workload:2,status:'Đang làm',issue:''},{common:true,name:'Old',detail:'Work',hours:null,workload:5,status:'Đang làm',issue:''}]};
  const html=c.rpWeekRowsHtml(report);
  assert(html.includes('<th>Thời gian thực hiện (giờ)</th>'));assert(!html.includes('<th>Giờ</th>'));assert(!html.includes('Workload'));
  assert(html.includes('ước lượng'));assert.equal(c.rpTimeValue(report.rows[0]),2);assert.equal(c.rpTimeValue(report.rows[1]),'5 (ước lượng)');
});
