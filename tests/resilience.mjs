import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import initSqlJs from '../backend/node_modules/sql.js/dist/sql-wasm.js';
const root=dirname(dirname(fileURLToPath(import.meta.url))),tmp=join(root,'backend','.testdata');
mkdirSync(tmp,{recursive:true});const dir=mkdtempSync(join(tmp,'finance-'));
for(const f of ['server.js','database.js','rules.js','photos.js','finance.js','schema.sql'])copyFileSync(join(root,'backend',f),join(dir,f));
const SQL=await initSqlJs(),seed=new SQL.Database();seed.run(readFileSync(join(dir,'schema.sql'),'utf8'));
seed.run("INSERT INTO config VALUES ('schema_version','3'); INSERT INTO barbeiros VALUES (1,'Dono',100,1,1),(2,'Equipe',50,0,1); INSERT INTO servicos VALUES (1,'Corte',100,0,NULL,1)");
seed.run("ALTER TABLE atendimentos ADD COLUMN metodo_pagamento TEXT DEFAULT 'dinheiro'");
for(const [i,b,valor,comissao,metodo] of [[1,1,50,50,'dinheiro'],[2,2,100,50,'pix'],[3,2,200,100,'cartao']]){
 seed.run('INSERT INTO atendimentos VALUES (?,?,1,?,0,0,?,?,?,NULL,?)',[i,b,valor,b===1?100:50,comissao,'2025-03-10T12:00:00.000Z',metodo]);
 seed.run('INSERT INTO atendimento_itens VALUES (?,?,1,?,0,0,?,?)',[i,i,valor,b===1?100:50,comissao]);
}
seed.run("CREATE TABLE gastos (id INTEGER PRIMARY KEY AUTOINCREMENT,categoria TEXT NOT NULL,descricao TEXT NOT NULL,valor REAL NOT NULL,metodo_pagamento TEXT NOT NULL,data_hora TEXT NOT NULL,observacao TEXT)");
seed.run("INSERT INTO gastos VALUES (1,'aluguel','Aluguel',40,'pix','2025-03-10T12:00:00.000Z',''),(2,'retirada do dono','Retirada',10,'dinheiro','2025-03-10T12:00:00.000Z','')");
writeFileSync(join(dir,'barbearia.db'),seed.export());seed.close();
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
let child,token,logs='',count=0;
async function start(){child=fork(join(dir,'server.js'),[],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});child.stderr.on('data',x=>logs+=x);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs)),10000);child.once('message',()=>{clearTimeout(timer);resolve()});child.once('exit',code=>{clearTimeout(timer);reject(Error('Exit '+code+' '+logs))})});}
async function stop(){if(child?.connected)await new Promise(r=>{child.once('exit',r);child.send('shutdown')});}
async function api(method,path,body,expected=200,auth=token){const res=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{'X-Relatorio-Token':auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await res.json();assert.equal(res.status,expected,path+' '+JSON.stringify(data));return data;}
const pos=()=>api('GET','/financeiro/posicao'),geral=()=>api('GET','/relatorio/geral');
const payload=extra=>({chave:randomUUID(),data_hora:new Date().toISOString(),...extra});
async function check(label,fn){await fn();count++;console.log('PASS '+label);}
try{
 await start();token=(await api('POST','/relatorio/configurar-senha',{senha:'teste123'})).token;
 await check('configuração e status de backups exigem dono',async()=>{
  await api('GET','/backup/status',undefined,401,'');await api('PUT','/backup/configuracao',{pasta:''},401,'');
  await api('PUT','/backup/configuracao',{pasta:'inexistente'},400);
 });
 await check('paginação de atendimentos, gastos e extrato preserva totais, ordem e itens',async()=>{
  for(let i=0;i<121;i++){
   await api('POST','/atendimentos',{barbeiro_id:2,itens:[{servico_id:1,valor_cobrado:100}],metodo_pagamento:'pix'});
   await api('POST','/gastos',{categoria:'outros',descricao:'Teste '+i,valor:1,metodo_pagamento:'pix',data_hora:'2025-03-10T12:00:00.000Z'});
  }
  for(const endpoint of ['/relatorio/atendimentos','/gastos','/financeiro/extrato']){
   const first=await api('GET',endpoint+'?pagina=1');assert.equal(first.itens.length,50);assert(first.total>100);
   const rows=[];for(let p=1;p<=first.paginas;p++)rows.push(...(await api('GET',endpoint+'?pagina='+p)).itens);
   assert.equal(new Set(rows.map(r=>r.id)).size,first.total);assert.equal(rows.length,first.total);
   for(let j=1;j<rows.length;j++)assert(rows[j-1].data_hora>=rows[j].data_hora);
   if(endpoint==='/relatorio/atendimentos'){assert(rows.every(r=>r.itens.length));assert.equal(first.valor,rows.reduce((sum,r)=>sum+r.valor_cobrado+r.valor_tinta,0));}
   if(endpoint==='/gastos')assert.equal(first.valor,rows.reduce((sum,r)=>sum+r.valor,0));
   await api('GET',endpoint+'?pagina=0',undefined,400);await api('GET',endpoint+'?pagina=1.2',undefined,400);
   const empty=await api('GET',endpoint+'?pagina=1&data_inicio=1900-01-01T00:00:00.000Z&data_fim=1900-01-02T00:00:00.000Z');assert.equal(empty.total,0);assert.equal(empty.itens.length,0);
  }
 });
 await stop();
 copyFileSync(join(root,'tests','resilience-check.mjs'),join(dir,'resilience-check.mjs'));
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,[join(dir,'resilience-check.mjs')],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());
 console.log('RESULTADO: 6 grupos de resiliência passaram.');
}finally{await stop()}
