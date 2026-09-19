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
 await check('migração preserva dados e separa lucro, caixa, cartão e dono',async()=>{
  const p=await pos(),g=await geral();assert.equal(p.saldo,100);assert.equal(p.comissoes_pendentes,150);assert.equal(p.cartao_a_receber,200);assert.equal(p.saldo_livre,-50);assert.equal(g.lucro,160);assert.equal(g.retiradas,10);assert.equal(p.saldo_inicial_configurado,false);
 });
 await check('todas as operações financeiras exigem autenticação',async()=>{
  for(const path of ['/financeiro/posicao','/financeiro/extrato','/financeiro/comparar'])await api('GET',path,undefined,401,'');
  for(const path of ['/financeiro/movimentos','/financeiro/comissoes/pagar','/financeiro/contas/1/pagar','/financeiro/cartoes/3/receber','/financeiro/cartoes/3/previsao','/financeiro/movimentos/1/estornar'])await api('POST',path,{},401,'');
 });
 await check('saldo inicial único, anterior ao histórico e sem alterar lucro',async()=>{
  await api('POST','/financeiro/movimentos',payload({tipo:'abertura',valor:500,descricao:'Saldo inicial'}),400);
  const body=payload({tipo:'abertura',valor:500,descricao:'Saldo inicial',data_hora:'2025-01-01T12:00:00.000Z'});
  const first=await api('POST','/financeiro/movimentos',body);assert.deepEqual(await api('POST','/financeiro/movimentos',body),first);
  await api('POST','/financeiro/movimentos',{...body,chave:randomUUID()},409);
  assert.equal((await pos()).saldo,600);assert.equal((await geral()).lucro,160);
 });
 let conta,cardReceipt,payment1,payment2;
 await check('conta a pagar afeta lucro uma vez e pagamento parcial só afeta caixa',async()=>{
  conta=await api('POST','/gastos',{categoria:'energia',descricao:'Energia',valor:60,metodo_pagamento:'pix',data_hora:'2026-01-10T12:00:00.000Z',vencimento:'2026-02-01',situacao:'pendente'});
  assert.equal((await geral()).lucro,100);assert.equal((await pos()).saldo,600);assert.equal((await pos()).contas_pendentes,60);
  await api('POST','/financeiro/contas/'+conta.id+'/pagar',payload({valor:20}));
  assert.equal((await pos()).saldo,580);assert.equal((await pos()).contas_pendentes,40);assert.equal((await geral()).lucro,100);
  await api('POST','/financeiro/contas/'+conta.id+'/pagar',payload({valor:41}),409);
  await api('PUT','/gastos/'+conta.id,{valor:30},409);await api('DELETE','/gastos/'+conta.id,undefined,409);
 });
 await check('cartão recebe líquido, taxa entra no lucro sem duplicação',async()=>{
  await api('POST','/financeiro/cartoes/3/previsao',payload({taxa:6,previsto_em:'2026-01-15'}));
  assert.equal((await pos()).cartao_a_receber,194);assert.equal((await geral()).lucro,94);
  const body=payload({taxa:6});cardReceipt=await api('POST','/financeiro/cartoes/3/receber',body);
  assert.deepEqual(await api('POST','/financeiro/cartoes/3/receber',body),cardReceipt);
  assert.equal((await pos()).saldo,774);assert.equal((await pos()).cartao_a_receber,0);assert.equal((await geral()).lucro,94);
  await api('POST','/financeiro/cartoes/3/receber',payload({taxa:6}),409);
  await api('DELETE','/atendimentos/3',undefined,409);
 });
 await check('comissão parcial, saldo pendente, duplicação e limites',async()=>{
  const body=payload({barbeiro_id:2,valor:30});payment1=await api('POST','/financeiro/comissoes/pagar',body);
  assert.deepEqual(await api('POST','/financeiro/comissoes/pagar',body),payment1);
  await api('POST','/financeiro/comissoes/pagar',{...body,valor:31},409);
  assert.equal((await pos()).saldo,744);assert.equal((await pos()).comissoes_pendentes,120);assert.equal((await geral()).lucro,94);
  const team=await api('GET','/relatorio/comissoes');assert.equal(team.find(r=>r.id===2).comissao_paga,30);assert.equal(team.find(r=>r.id===2).comissao_pendente,120);
  await api('POST','/financeiro/comissoes/pagar',payload({barbeiro_id:1,valor:1}),409);
  await api('POST','/financeiro/comissoes/pagar',payload({barbeiro_id:2,valor:121}),409);
  await api('DELETE','/atendimentos/2',undefined,409);
  const saldoAntesLimpeza=(await pos()).saldo;
  await api('DELETE','/atendimentos',{confirmacao:'APAGAR TODOS'},409);
  assert.equal((await pos()).saldo,saldoAntesLimpeza);
  assert.equal((await geral()).total_atendimentos,3);
  payment2=await api('POST','/financeiro/comissoes/pagar',payload({barbeiro_id:2,valor:120}));
  assert.equal((await pos()).saldo,624);assert.equal((await pos()).comissoes_pendentes,0);
 });
 await check('estornos preservam trilha e reabrem obrigações sem duplicar lucro',async()=>{
  for(const m of [payment1,payment2])await api('POST','/financeiro/movimentos/'+m.id+'/estornar',payload({motivo:'Correção de teste'}));
  assert.equal((await pos()).comissoes_pendentes,150);assert.equal((await pos()).saldo,774);
  await api('POST','/financeiro/movimentos/'+cardReceipt.id+'/estornar',payload({motivo:'Correção de teste'}));
  assert.equal((await pos()).saldo,580);assert.equal((await pos()).cartao_a_receber,194);assert.equal((await geral()).lucro,94);
  const extrato=await api('GET','/financeiro/extrato');assert.equal(extrato.filter(m=>m.estornado_em).length,3);
 });
 await check('retirada e aporte não alteram lucro',async()=>{
  await api('POST','/gastos',{categoria:'retirada do dono',descricao:'Retirada atual',valor:15,metodo_pagamento:'pix',data_hora:new Date().toISOString(),situacao:'pago'});
  assert.equal((await pos()).saldo,565);assert.equal((await geral()).lucro,94);
  await api('POST','/financeiro/movimentos',payload({tipo:'aporte',valor:100,descricao:'Capital do dono'}));
  assert.equal((await pos()).saldo,665);assert.equal((await geral()).lucro,94);
 });
 await check('comparação entre anos usa competências, não pagamentos',async()=>{
  const p=new URLSearchParams({data_inicio:'2026-01-01T00:00:00.000Z',data_fim:'2026-12-31T23:59:59.999Z',anterior_inicio:'2025-01-01T00:00:00.000Z',anterior_fim:'2025-12-31T23:59:59.999Z'});
  const r=await api('GET','/financeiro/comparar?'+p);assert.equal(r.atual.lucro,-60);assert.equal(r.anterior.lucro,154);assert.equal(r.diferencas.lucro.valor,-214);
  p.set('anterior_inicio','2024-01-01T00:00:00.000Z');p.set('anterior_fim','2024-12-31T23:59:59.999Z');assert.equal((await api('GET','/financeiro/comparar?'+p)).diferencas.lucro.percentual,null);
 });
 await check('entrada inválida reverte operações sem alterar o saldo',async()=>{
  const before=await pos();
  for(const body of [payload({tipo:'aporte',valor:-1,descricao:'Teste'}),payload({tipo:'aporte',valor:1.001,descricao:'Teste'}),payload({tipo:'aporte',valor:1,descricao:'Teste',data_hora:'2099-01-01T00:00:00.000Z'})])await api('POST','/financeiro/movimentos',body,400);
  await api('POST','/gastos',{categoria:'energia',descricao:'Inválida',valor:60,metodo_pagamento:'pix',data_hora:new Date().toISOString(),vencimento:'2026-02-30',situacao:'pendente'},400);
  assert.equal((await pos()).saldo,before.saldo);assert.equal((await pos()).contas_pendentes,before.contas_pendentes);
 });
 await check('reinício não repete migração nem movimentos',async()=>{
  const before=await pos(),extrato=await api('GET','/financeiro/extrato');await stop();await start();token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
  assert.equal((await pos()).saldo,before.saldo);assert.equal((await pos()).comissoes_pendentes,before.comissoes_pendentes);assert.deepEqual(await api('GET','/financeiro/extrato'),extrato);
 });
 await check('atendimento corrigido ou excluído ajusta a entrada uma única vez',async()=>{
  const before=await pos();
  const a=await api('POST','/atendimentos',{barbeiro_id:1,itens:[{servico_id:1,valor_cobrado:80}],metodo_pagamento:'dinheiro'});
  assert.equal((await pos()).saldo,before.saldo+80);
  await api('PUT','/atendimentos/'+a.id,{itens:[{servico_id:1,valor_cobrado:50}],metodo_pagamento:'pix'});
  assert.equal((await pos()).saldo,before.saldo+50);
  await api('DELETE','/atendimentos/'+a.id);assert.equal((await pos()).saldo,before.saldo);
 });
 await check('pagamento respeita o período e não usa comissões fora dele',async()=>{
  const before=await pos();
  await api('POST','/financeiro/comissoes/pagar',payload({barbeiro_id:2,valor:1,data_inicio:'2024-01-01T00:00:00.000Z',data_fim:'2024-12-31T23:59:59.999Z'}),409);
  assert.equal((await pos()).saldo,before.saldo);
 });
 console.log('RESULTADO: '+count+' grupos financeiros passaram.');
}finally{await stop();}
