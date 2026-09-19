import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import vm from 'node:vm';
import initSqlJs from '../backend/node_modules/sql.js/dist/sql-wasm.js';
import { tmpdir } from 'node:os';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const tempRoot=join(root,'backend','.testdata');
mkdirSync(tempRoot,{recursive:true});
const dir=mkdtempSync(join(tempRoot,'regression-'));
for(const f of ['server.js','database.js','rules.js','photos.js','finance.js','schema.sql'])copyFileSync(join(root,'backend',f),join(dir,f));
const SQL=await initSqlJs();
const seed=new SQL.Database();
seed.run(readFileSync(join(dir,'schema.sql'),'utf8').replace(' ON DELETE CASCADE',''));
seed.run("INSERT INTO barbeiros VALUES (1,'Dono',100,1,1),(2,'Antigo',50,0,1)");
seed.run("INSERT INTO servicos VALUES (1,'Corte',100,0,NULL,1),(2,'  Pigmentacao antiga',100,1,35,1),(3,'Pintar antigo',100,1,0,1)");
seed.run("INSERT INTO atendimentos VALUES (1,2,1,100,20,1,50,50,'2020-01-01T12:00:00.000Z','Preservar'),(2,2,1,30,0,0,50,15,'2020-01-01T13:00:00.000Z','Migrar')");
seed.run("INSERT INTO atendimento_itens VALUES (1,1,1,50,20,1,50,25),(2,1,1,50,0,0,50,25)");
const original=seed.export();writeFileSync(join(dir,'barbearia.db'),original);seed.close();
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
let child,logs='',token;
async function start(){
 child=fork(join(dir,'server.js'),[],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 child.stderr.on('data',x=>logs+=x);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout '+logs)),10000);child.once('message',m=>{clearTimeout(timer);assert.equal(m,'ready');resolve()});child.once('exit',code=>{clearTimeout(timer);reject(Error('Startup exit '+code+' '+logs))})});
}
async function stop(){if(!child?.connected)return;await new Promise(resolve=>{child.once('exit',resolve);child.send('shutdown')})}
async function api(method,path,body,auth=undefined,expected=200){
 if ((path.startsWith('/servicos') || path.startsWith('/barbeiros')) && method !== 'GET' && auth === undefined) auth=token;
 const res=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{'X-Relatorio-Token':auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json();assert.equal(res.status,expected,method+' '+path+' '+JSON.stringify(data));return data;
}
let count=0;
async function check(label,fn){await fn();count++;console.log('PASS '+label)}
try{
 await start();
 await check('migração preserva histórico, corrige pigmentações e completa atendimento sem itens',async()=>{
   const services=await api('GET','/servicos');
   for(const s of services.filter(s=>s.id===2||s.id===3)){assert.equal(s.apenas_dono,1);assert.equal(s.comissao_fixa_pct,0)}
   const backups=readdirSync(dir).filter(f=>f.startsWith('barbearia-antes-migracao'));
   assert.equal(backups.length,1);assert.deepEqual(readFileSync(join(dir,backups[0])),Buffer.from(original));
 });
 await check('senha mínima e configuração única',async()=>{
   await api('POST','/relatorio/configurar-senha',{senha:'123'},undefined,400);
   token=(await api('POST','/relatorio/configurar-senha',{senha:'teste123'})).token;
   await api('POST','/relatorio/configurar-senha',{senha:'outra'},undefined,400);
   await api('POST','/relatorio/login',{senha:'errada'},undefined,401);
 });
 await check('histórico antigo preserva comissões e duplicatas anteriores',async()=>{
   const rows=await api('GET','/relatorio/atendimentos',undefined,token);
   assert.equal(rows.find(a=>a.id===1).itens.length,2);assert.equal(rows.find(a=>a.id===1).valor_comissao,50);
   assert.equal(rows.find(a=>a.id===2).itens.length,1);
 });
 await check('rotas financeiras, backup e limpeza exigem dono',async()=>{
   for(const p of ['/relatorio/comissoes','/relatorio/geral','/relatorio/atendimentos','/backup'])await api('GET',p,undefined,undefined,401);
   await api('POST','/backup',{},undefined,401);await api('DELETE','/atendimentos',{},undefined,401);
   assert.equal((await api('GET','/atendimentos')).length,0);
 });

 await check('todos os cadastros, fotos, gastos e mutações de atendimento exigem dono',async()=>{
   for(const [method,path,body] of [
    ['POST','/barbeiros',{nome:'Bloqueado',comissao_percentual:50}],['PUT','/barbeiros/1',{nome:'Bloqueado'}],['DELETE','/barbeiros/2'],
    ['POST','/barbeiros/1/foto',{}],['DELETE','/barbeiros/1/foto'],
    ['POST','/servicos',{nome:'Bloqueado',valor:1}],['PUT','/servicos/1',{apenas_dono:false}],['DELETE','/servicos/1'],
    ['GET','/gastos'],['POST','/gastos',{}],['PUT','/gastos/1',{}],['DELETE','/gastos/1'],
    ['PUT','/atendimentos/1',{}],['DELETE','/atendimentos/1']
   ])await api(method,path,body,'',401);
 });
 const b=await api('POST','/barbeiros',{nome:"D'Ávila <img src=x onerror=alert(1)>",comissao_percentual:50});
 const corte=await api('POST','/servicos',{nome:'Corte teste',valor:100});
 const fixo=await api('POST','/servicos',{nome:'Luzes',valor:100,comissao_fixa_pct:35});
 const exclusivo=await api('POST','/servicos',{nome:'Exclusivo',valor:100,apenas_dono:1});
 const pigmento=await api('POST','/servicos',{nome:' Pigmentacao nova ',valor:100,apenas_dono:1,comissao_fixa_pct:35});
 const atendimento=(barbeiro_id,servico_id,extra={})=>api('POST','/atendimentos',{barbeiro_id,itens:[{servico_id,valor_cobrado:100}],valor_tinta:20,...extra});
 await check('dono 100%, padrão sem tinta, fixo 35% e zero',async()=>{
   assert.equal((await atendimento(1,fixo.id)).valor_comissao,120);
   assert.equal((await atendimento(b.id,corte.id)).valor_comissao,50);
   assert.equal((await atendimento(b.id,fixo.id)).valor_comissao,35);
   assert.equal((await atendimento(1,pigmento.id)).valor_comissao,120);
   assert.equal(pigmento.apenas_dono,1);assert.equal(pigmento.comissao_fixa_pct,0);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:pigmento.id,valor_cobrado:100}]},undefined,400);
 });
 await check('formato antigo soma tinta somente uma vez',async()=>{
   const a=await api('POST','/atendimentos',{barbeiro_id:1,servico_id:corte.id,valor_cobrado:100,valor_tinta:20});
   assert.equal(a.valor_tinta,20);assert.equal(a.valor_comissao,120);assert.equal(a.itens.length,1);
 });
 await check('dono escolhe exclusividade da pigmentação e escolha persiste',async()=>{
   await api('PUT','/servicos/'+pigmento.id,{apenas_dono:false},'',401);
   await api('POST','/servicos',{nome:'Pigmentação sem autorização',valor:10},'',401);
   const livre=await api('PUT','/servicos/'+pigmento.id,{apenas_dono:false,comissao_fixa_pct:70},token);
   assert.equal(livre.apenas_dono,0);assert.equal(livre.comissao_fixa_pct,0);
   assert.equal((await atendimento(b.id,pigmento.id)).valor_comissao,0);
   assert.equal((await api('PUT','/servicos/'+pigmento.id,{valor:90},token)).apenas_dono,0);
   await stop();await start();
   token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
   assert.equal((await api('GET','/servicos')).find(s=>s.id===pigmento.id).apenas_dono,0);
   await api('PUT','/servicos/'+pigmento.id,{apenas_dono:true},token);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:pigmento.id,valor_cobrado:100}]},undefined,400);
   assert.equal((await atendimento(1,pigmento.id)).valor_comissao,120);
 });
 await check('duplicatas numéricas/textuais e exclusivo recusados sem lançamento parcial',async()=>{
   const before=await api('GET','/relatorio/geral',undefined,token);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:corte.id,valor_cobrado:100},{servico_id:String(corte.id),valor_cobrado:100}]},undefined,400);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:exclusivo.id,valor_cobrado:100}]},undefined,400);
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
 });
 await check('zero editável e comissão fixa preservada em edição parcial',async()=>{
   assert.equal((await api('PUT','/barbeiros/'+b.id,{comissao_percentual:0})).comissao_percentual,0);
   assert.equal((await api('PUT','/servicos/'+fixo.id,{valor:0})).valor,0);
   assert.equal((await api('PUT','/servicos/'+fixo.id,{nome:'Luzes editadas'})).comissao_fixa_pct,35);
   await api('PUT','/barbeiros/'+b.id,{comissao_percentual:50});
 });
 await check('entrada inválida recusada e arredondamento por item',async()=>{
   for(const value of [-1,101,'abc',null,''])await api('POST','/barbeiros',{nome:'Inválido',comissao_percentual:value},undefined,400);
   for(const value of [-1,'10abc',null,'',0.001])await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:corte.id,valor_cobrado:value}]},undefined,400);
   await api('POST','/barbeiros',{nome:' ',comissao_percentual:50},undefined,400);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[null]},undefined,400);
   await api('PUT','/servicos/999999',{nome:'Não existe'},undefined,404);
   const a=await atendimento(b.id,corte.id,{itens:[{servico_id:corte.id,valor_cobrado:0.01}],valor_tinta:0});
   assert.equal(a.valor_comissao,0.01);
 });
 await check('tinta global e flag aplicadas somente ao primeiro item',async()=>{
   const a=await atendimento(b.id,corte.id,{itens:[{servico_id:corte.id,valor_cobrado:100},{servico_id:fixo.id,valor_cobrado:100}],valor_tinta:20,tem_pigmentacao:0});
   assert.equal(a.itens[0].valor_tinta,20);assert.equal(a.itens[0].tem_pigmentacao,1);assert.equal(a.itens[1].valor_tinta,0);assert.equal(a.valor_comissao,85);
 });
 await check('exclusão individual atualiza ambos relatórios e preserva outros registros',async()=>{
   const before=await api('GET','/relatorio/geral',undefined,token);
   const per=await api('GET','/relatorio/comissoes',undefined,token);
   const a=await atendimento(b.id,corte.id,{itens:[{servico_id:corte.id,valor_cobrado:100},{servico_id:fixo.id,valor_cobrado:100}]});
   await api('DELETE','/atendimentos/'+a.id,undefined,token);
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
   assert.deepEqual(await api('GET','/relatorio/comissoes',undefined,token),per);
   await api('DELETE','/atendimentos/'+a.id,undefined,token,404);
 });
 await check('histórico público limitado ao dia e sem comissões; antigas só dono exclui',async()=>{
   const rows=await api('GET','/atendimentos?data_inicio=2000-01-01T00:00:00.000Z');
   assert(rows.length>0);assert(rows.every(a=>a.id>2&&!('valor_comissao'in a)&&a.itens.every(i=>!('valor_comissao'in i))));
   await api('DELETE','/atendimentos/2',undefined,undefined,401);
   await api('DELETE','/atendimentos/2',undefined,token);
 });

 await check('recebimentos por método, gastos, categorias e saldo conciliam',async()=>{
   const initial=await api('GET','/relatorio/geral',undefined,token);
   const created=[];
   for(const [method,value] of [['dinheiro',31],['pix',42],['cartao',53]])created.push(await atendimento(b.id,corte.id,{itens:[{servico_id:corte.id,valor_cobrado:value}],valor_tinta:4,metodo_pagamento:method}));
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:corte.id,valor_cobrado:10}],metodo_pagamento:'cheque'},'',400);
   const date=new Date().toISOString();
   const gasto=await api('POST','/gastos',{categoria:'tinta',descricao:'Tinta <teste> & "aspas"',valor:21.50,metodo_pagamento:'pix',data_hora:date,observacao:'Observação <script>'},token);
   const g=await api('GET','/relatorio/geral',undefined,token);
   assert.equal(g.total_recebido,Math.round((initial.total_recebido+138)*100)/100);
   assert.equal(g.total_gastos,initial.total_gastos+21.5);
   assert.equal(g.saldo_operacional,Math.round((g.total_recebido-g.total_gastos)*100)/100);
   for(const [method,amount] of [['dinheiro',35],['pix',46],['cartao',57]])assert.equal(g.pagamentos.find(p=>p.metodo_pagamento===method).total,Math.round(((initial.pagamentos.find(p=>p.metodo_pagamento===method)?.total||0)+amount)*100)/100);
   assert.equal(g.gastos_por_categoria.find(x=>x.categoria==='tinta').total,21.5);
   const edited=await api('PUT','/gastos/'+gasto.id,{valor:25,metodo_pagamento:'cartao'},token);assert.equal(edited.observacao,'Observação <script>');
   assert.equal((await api('GET','/gastos?categoria=tinta',undefined,token)).length,1);
   assert.equal((await api('GET','/gastos?categoria=energia',undefined,token)).length,0);
   assert.equal((await api('GET','/gastos?data_inicio=2000-01-01T00:00:00.000Z&data_fim=2000-12-31T23:59:59.999Z',undefined,token)).length,0);
   for(const bad of [{valor:-1},{valor:0},{data_hora:'2026-02-30T12:00:00.000Z'},{categoria:'inválida'},{metodo_pagamento:'cheque'},{observacao:{}}])await api('PUT','/gastos/'+gasto.id,bad,token,400);
   await api('GET','/gastos?data_inicio=2026-09-19T00:00:00.000Z&data_fim=2026-09-18T00:00:00.000Z',undefined,token,400);
   const beforeRestart=await api('GET','/gastos',undefined,token);
   await stop();await start();token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
   assert.deepEqual(await api('GET','/gastos',undefined,token),beforeRestart);
   assert.equal((await api('GET','/relatorio/geral',undefined,token)).total_gastos,25);
   const commissions=await api('GET','/relatorio/comissoes',undefined,token);
   await api('DELETE','/gastos/'+gasto.id,undefined,token);
   assert.deepEqual(await api('GET','/relatorio/comissoes',undefined,token),commissions);
   await api('DELETE','/gastos/'+gasto.id,undefined,token,404);
 });
 await check('edição atômica, serviços, backup anterior e pagamentos atualizados',async()=>{
   const a=await atendimento(b.id,corte.id,{metodo_pagamento:'dinheiro'});
   await api('DELETE','/atendimentos/'+a.id,undefined,'',401);
   const before=await api('GET','/relatorio/geral',undefined,token);
   for(const itens of [[],[null],[{servico_id:corte.id,valor_cobrado:10},{servico_id:corte.id,valor_cobrado:20}],[{servico_id:corte.id,valor_cobrado:-1}]])await api('PUT','/atendimentos/'+a.id,{itens},token,400);
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
   const response=await api('PUT','/atendimentos/'+a.id,{itens:[{servico_id:fixo.id,valor_cobrado:80,valor_tinta:10},{servico_id:corte.id,valor_cobrado:30}],metodo_pagamento:'pix',observacao:'Edição <teste>'},token);
   assert(response.backup);
   const backup=new SQL.Database(readFileSync(join(dir,'backups',response.backup)));
   assert.equal(backup.exec('SELECT valor_cobrado FROM atendimentos WHERE id='+a.id)[0].values[0][0],100);backup.close();
   const row=(await api('GET','/relatorio/atendimentos',undefined,token)).find(x=>x.id===a.id);
   assert.equal(row.valor_comissao,43);assert.equal(row.valor_tinta,10);assert.equal(row.valor_cobrado,110);assert.equal(row.metodo_pagamento,'pix');assert.equal(row.itens.length,2);assert.equal(row.observacao,'Edição <teste>');
   await api('PUT','/atendimentos/'+a.id,{itens:[{servico_id:corte.id,valor_cobrado:60}]},token);
   const removed=(await api('GET','/relatorio/atendimentos',undefined,token)).find(x=>x.id===a.id);assert.equal(removed.itens.length,1);assert.equal(removed.valor_comissao,30);
   await api('DELETE','/atendimentos/'+a.id,undefined,token);
 });

 await check('colaborador inativo mantém histórico mas não pode atender',async()=>{
   const before=await api('GET','/relatorio/geral',undefined,token);
   await api('DELETE','/barbeiros/'+b.id);
   const r=(await api('GET','/relatorio/comissoes',undefined,token)).find(r=>r.id===b.id);
   assert.equal(r.ativo,0);assert(r.total_atendimentos>0);
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
   await api('POST','/atendimentos',{barbeiro_id:b.id,itens:[{servico_id:corte.id,valor_cobrado:100}]},undefined,404);
 });
 await check('serviço inativo recusado; dono e exclusivo não excluídos',async()=>{
   await api('DELETE','/servicos/'+corte.id);
   await api('POST','/atendimentos',{barbeiro_id:1,itens:[{servico_id:corte.id,valor_cobrado:100}]},undefined,404);
   await api('DELETE','/barbeiros/1');assert((await api('GET','/barbeiros')).some(b=>b.id===1));
   await api('DELETE','/servicos/'+exclusivo.id);assert((await api('GET','/servicos')).some(s=>s.id===exclusivo.id));
 });
 await check('relatórios conciliam e separam remuneração do dono',async()=>{
   const g=await api('GET','/relatorio/geral',undefined,token),r=await api('GET','/relatorio/comissoes',undefined,token);
   const sum=k=>Math.round(r.reduce((s,a)=>s+a[k],0)*100)/100;
   assert.equal(sum('total_barbearia'),g.total_barbearia);
   assert.equal(sum('total_faturado'),g.total_geral);
   assert.equal(sum('total_comissao_colaborador'),Math.round((g.total_colaboradores+g.total_comissao_dono)*100)/100);
 });
 await check('backup autenticado, nomes únicos e caminho externo rejeitado',async()=>{
   const a=await api('POST','/backup',{},token),b=await api('POST','/backup',{},token);assert.notEqual(a.arquivo,b.arquivo);
   await api('GET','/backup?arquivo='+encodeURIComponent('../barbearia.db'),undefined,token,404);
   await api('GET','/backup?arquivo='+a.arquivo,undefined,undefined,401);
   const res=await fetch('http://127.0.0.1:'+port+'/api/backup?arquivo='+a.arquivo,{headers:{'X-Relatorio-Token':token}});assert.equal(res.status,200);assert((await res.arrayBuffer()).byteLength>0);
 });
 await check('datas inválidas e acesso de outro site recusados',async()=>{
   await api('GET','/relatorio/geral?data_inicio=erro',undefined,token,400);
   const r=await fetch('http://127.0.0.1:'+port+'/api/barbeiros',{headers:{Origin:'https://outro-site.example'}});assert.equal(r.status,403);
 });
 await check('logout revoga token no servidor',async()=>{
   await api('POST','/relatorio/logout',{},token);await api('GET','/relatorio/geral',undefined,token,401);
   token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
 });
 await check('reinício preserva dados e invalida sessão',async()=>{
   const before=await api('GET','/relatorio/geral',undefined,token);await stop();await start();
   await api('GET','/relatorio/geral',undefined,token,401);token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
   assert.equal(readdirSync(dir).filter(f=>f.startsWith('barbearia-antes-migracao')).length,1);
 });
 await check('fechar o iniciador encerra o servidor e preserva os dados',async()=>{
   const before=await api('GET','/relatorio/geral',undefined,token);
   await new Promise(resolve=>{child.once('exit',resolve);child.disconnect()});
   await start();token=(await api('POST','/relatorio/login',{senha:'teste123'})).token;
   assert.deepEqual(await api('GET','/relatorio/geral',undefined,token),before);
 });
 await check('limpeza total exige confirmação, gera backup e preserva senha',async()=>{
   await api('DELETE','/atendimentos',{},token,400);
   const response=await api('DELETE','/atendimentos',{confirmacao:'APAGAR TODOS'},token);assert(response.backup);
   assert.equal((await api('GET','/relatorio/geral',undefined,token)).total_atendimentos,0);
   assert.equal((await api('GET','/relatorio/status')).senhaConfigurada,true);
 });
 await stop();
 // Test database constraints and rollback independently after closing the API.
 copyFileSync(join(root,'tests','database-check.mjs'),join(dir,'database-check.mjs'));
 const result=spawnSync(process.execPath,[join(dir,'database-check.mjs')],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stdout+result.stderr);console.log(result.stdout.trim());count+=5;
 const html=readFileSync(join(root,'frontend','index.html'),'utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 new vm.Script(readFileSync(join(root,'frontend','owner-ui.js'),'utf8'));
 const ctx={};vm.createContext(ctx);vm.runInContext(readFileSync(join(root,'frontend','ui-helpers.js'),'utf8'),ctx);
 assert.equal(ctx.escapeHtml("<img onerror='x'>"),'&lt;img onerror=&#39;x&#39;&gt;');assert.equal(ctx.safePhoto('https://evil.example/x'),'assets/logo.png');
 count++;console.log('PASS sintaxe da interface, escape de texto e fotos locais');
 const dates=html.slice(html.indexOf('function utcInicioDiaLocal'),html.indexOf('// Histórico de Atendimentos (sempre'));
 vm.runInContext(dates,ctx);
 const localStart=new Date(2026,8,18,0,0,0,0).toISOString(),localEnd=new Date(2026,8,18,23,59,59,999).toISOString();
 assert.equal(ctx.dataInputParaUtcInicio('2026-09-18'),localStart);assert.equal(ctx.dataInputParaUtcFim('2026-09-18'),localEnd);
 count++;console.log('PASS limites do dia local convertidos para UTC');
 console.log('RESULTADO: '+count+' grupos de testes passaram. Banco de teste: '+dir);
}finally{await stop()}
