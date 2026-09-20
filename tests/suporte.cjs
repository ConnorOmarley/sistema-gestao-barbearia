const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawnSync,fork}=require('node:child_process');
const {createRequire}=require('node:module');
const source=process.env.SUPORTE_PROJECT||path.resolve(__dirname,'..');
const corePath=path.join(source,'ferramentas-suporte/suporte.cjs');
const core=require(corePath);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const put=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes)};
async function main(){
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));process.env.PORT=String(port);
 const temp=fs.mkdtempSync(path.join(source,'backend/.testdata/suporte-'));
 const root=path.join(temp,'Barbearia de teste ação');fs.mkdirSync(root);
 for(const [file,value] of Object.entries({'iniciar_sistema.bat':'@echo off','backend/server.js':'// servidor anterior','backend/package.json':JSON.stringify({type:'module',dependencies:{}}),'frontend/index.html':'<html>Anterior</html>'}))put(path.join(root,file),value);
 const SQL=await createRequire(path.join(source,'backend/package.json'))('sql.js')();
 const seed=new SQL.Database();seed.run(fs.readFileSync(path.join(source,'backend/schema.sql'),'utf8'));
 seed.run("INSERT INTO config VALUES ('backup_instalacao','cliente-a');INSERT INTO barbeiros VALUES(1,'Cliente A',100,1,1);INSERT INTO servicos VALUES(1,'Corte',30,0,NULL,1)");
 const dbFile=path.join(root,'backend/barbearia.db');put(dbFile,seed.export());seed.close();
 const pack=path.join(temp,'pacote');let count=0;
 const packageFor=(files)=>{const entries=[];for(const [file,bytes]of Object.entries(files)){put(path.join(pack,'arquivos',file),bytes);entries.push({caminho:file,sha256:hash(bytes)});}put(path.join(pack,'manifesto.json'),JSON.stringify({formato:1,versao:'suporte-teste',arquivos:entries}));};
 const originalDb=fs.readFileSync(dbFile),initialHtml=fs.readFileSync(path.join(root,'frontend/index.html'));
 const check=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
 await check('atualiza em caminho com espaços e acentos, preservando banco e cópia anterior',async()=>{
  packageFor({'frontend/index.html':'<html>Atualizado</html>','backend/novo.js':'export const teste=1;'});
  const result=await core.update(root,pack);assert(result.sucesso);assert.equal(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8'),'<html>Atualizado</html>');assert.deepEqual(fs.readFileSync(dbFile),originalDb);
  assert.deepEqual(fs.readFileSync(path.join(result.copia_anterior,'originais/frontend/index.html')),initialHtml);assert.deepEqual(fs.readFileSync(path.join(result.copia_anterior,'originais/backend/barbearia.db')),originalDb);
 });
 await check('falha durante instalação reverte arquivos alterados e remove novos',async()=>{
  packageFor({'backend/temporario.js':'export const teste=2;','frontend/index.html':'<html>Não deve ficar</html>'});
  await assert.rejects(core.update(root,pack,{afterWrite:n=>{if(n===2)throw Error('falha simulada')}}),/falha simulada/);
  assert(!fs.existsSync(path.join(root,'backend/temporario.js')));assert.equal(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8'),'<html>Atualizado</html>');assert.deepEqual(fs.readFileSync(dbFile),originalDb);assert(!fs.existsSync(path.join(root,'backend/suporte-manutencao.json')));
 });
 await check('interrupção de processo mantém registro e permite recuperação posterior',async()=>{
  packageFor({'frontend/index.html':'<html>Interrompido</html>'});
  const code=`require(${JSON.stringify(corePath)}).update(${JSON.stringify(root)},${JSON.stringify(pack)},{afterWrite(){process.exit(42)}})`;
  const child=spawnSync(process.execPath,['-e',code],{encoding:'utf8',windowsHide:true});assert.equal(child.status,42,child.stderr);
  assert(fs.existsSync(path.join(root,'backend/suporte-manutencao.json')));
  await assert.rejects(core.update(root,pack),/pendente/);
  await core.recover(root);assert.equal(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8'),'<html>Atualizado</html>');assert.deepEqual(fs.readFileSync(dbFile),originalDb);
 });
 await check('pacote adulterado, caminho externo e erro de sintaxe são recusados antes de alterar',async()=>{
  packageFor({'frontend/index.html':'validado'});put(path.join(pack,'arquivos/frontend/index.html'),'alterado');await assert.rejects(core.update(root,pack),/alterado/);
  put(path.join(pack,'manifesto.json'),JSON.stringify({formato:1,versao:'x',arquivos:[{caminho:'../fora.js',sha256:'x'}]}));await assert.rejects(core.update(root,pack),/permitido/);
  packageFor({'backend/erro.js':'const = ;'});await assert.rejects(core.update(root,pack),/código/);assert(!fs.existsSync(path.join(root,'backend/erro.js')));
 });
 await check('sistema aberto impede atualização e restauração',async()=>{
  const busy=net.createServer();await new Promise(r=>busy.listen(port,'127.0.0.1',r));
  try{packageFor({'frontend/index.html':'novo'});await assert.rejects(core.update(root,pack),/aberto/);await assert.rejects(core.restore(root,dbFile,hash(originalDb)),/aberto/);}finally{await new Promise(r=>busy.close(r));}
 });
 await check('restauração validada guarda banco anterior e exige a cópia confirmada',async()=>{
  const db=new SQL.Database(new Uint8Array(originalDb));db.run("INSERT INTO atendimentos (barbeiro_id,servico_id,valor_cobrado,comissao_percentual,valor_comissao,data_hora) VALUES (1,1,30,100,30,'2026-01-01T12:00:00.000Z')");
  const newer=Buffer.from(db.export());db.close();put(dbFile,newer);const backup=path.join(temp,'copia.db');put(backup,originalDb);
  const details=await core.inspectDatabase(root,backup);assert.equal(details.atendimentos,0);
  await assert.rejects(core.restore(root,backup,'outro-hash'),/mudou/);assert.deepEqual(fs.readFileSync(dbFile),newer);
  const result=await core.restore(root,backup,details.sha256);assert.deepEqual(fs.readFileSync(dbFile),originalDb);assert.deepEqual(fs.readFileSync(path.join(result.copia_anterior,'originais/backend/barbearia.db')),newer);
 });
 await check('cópia de outro cliente e cópia corrompida não substituem banco',async()=>{
  const other=new SQL.Database(new Uint8Array(originalDb));other.run("UPDATE config SET valor='cliente-b' WHERE chave='backup_instalacao'");const file=path.join(temp,'outra.db');put(file,other.export());other.close();
  const details=await core.inspectDatabase(root,file);await assert.rejects(core.restore(root,file,details.sha256),/outra instalação/);
  put(file,'não é um banco');await assert.rejects(core.restore(root,file,hash('não é um banco')));assert.deepEqual(fs.readFileSync(dbFile),originalDb);
 });
 await check('recuperação também conclui preparação sem alterações e é idempotente',async()=>{
  put(path.join(root,'backend/suporte-manutencao.json'),JSON.stringify({preparando:true}));await core.recover(root);assert(!fs.existsSync(path.join(root,'backend/suporte-manutencao.json')));assert((await core.recover(root)).sucesso);
 });
 await check('pacote completo atualiza instalação anterior e servidor abre preservando registros',async()=>{
  const full=path.join(temp,'pacote-completo'),client=path.join(temp,'Cliente completo');
  const built=spawnSync(process.execPath,[path.join(source,'scripts/empacotar-suporte.cjs'),full],{encoding:'utf8',windowsHide:true,env:{...process.env,SUPORTE_PROJECT:source}});assert.equal(built.status,0,built.stderr);
  for(const file of ['backend/package.json','backend/server.js','frontend/index.html'])put(path.join(client,file),fs.readFileSync(path.join(source,file)));
  put(path.join(client,'iniciar_sistema.bat'),'@echo off');put(path.join(client,'backend/barbearia.db'),originalDb);
  const result=await core.update(client,path.join(full,'pacote'));assert(result.sucesso);assert.deepEqual(fs.readFileSync(path.join(client,'backend/barbearia.db')),originalDb);
  put(path.join(client,'backend/suporte-manutencao.json'),JSON.stringify({preparando:true}));
  const blocked=spawnSync(process.execPath,[path.join(client,'backend/launcher.js')],{encoding:'utf8',windowsHide:true});assert.equal(blocked.status,1);assert.match(blocked.stderr,/pendente/i);assert.deepEqual(fs.readFileSync(path.join(client,'backend/barbearia.db')),originalDb);
  await core.recover(client);
  const child=fork(path.join(client,'backend/server.js'),[],{env:process.env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});let logs='';child.stderr.on('data',b=>logs+=b);
  try{
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou: '+logs)),10000);child.once('message',()=>{clearTimeout(timer);resolve()});child.once('exit',code=>{clearTimeout(timer);reject(Error('Servidor encerrou: '+code+' '+logs))})});
   const response=await fetch('http://127.0.0.1:'+port+'/api/relatorio/status');assert.equal(response.status,200);
  }finally{if(child.connected)await new Promise(resolve=>{child.once('exit',resolve);child.send('shutdown')});}
  const dbInfo=await core.inspectDatabase(client,path.join(client,'backend/barbearia.db'));assert.equal(dbInfo.atendimentos,0);assert.equal(dbInfo.dono,'Cliente A');
 });
 console.log('RESULTADO: '+count+' grupos de suporte passaram.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
