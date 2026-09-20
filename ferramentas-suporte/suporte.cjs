const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {createRequire} = require('node:module');
const {spawnSync} = require('node:child_process');
const vm = require('node:vm');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const error = message => { throw new Error(message); };
const lockName = 'backend/suporte-manutencao.json';

function safePath(root, relative) {
  if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.split('/').some(p=>!p||p==='.'||p==='..'))error('Caminho inválido no pacote.');
  const result=path.resolve(root,...relative.split('/'));
  let cursor=root;
  for(const part of relative.split('/')){
    cursor=path.join(cursor,part);
    if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())error('Pastas com atalhos ou links não são suportadas: '+relative);
  }
  return result;
}
function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.suporte-'+crypto.randomUUID()+'.tmp';
  let fd;
  try{
    fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temporary,file);
  }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
const writeJson=(file,value)=>atomicWrite(file,Buffer.from(JSON.stringify(value,null,2)));
function installation(value){
  const root=fs.realpathSync(value);
  for(const file of ['iniciar_sistema.bat','backend/server.js','backend/package.json','frontend/index.html'])if(!fs.existsSync(safePath(root,file)))error('Selecione a pasta do sistema, onde fica iniciar_sistema.bat.');
  return root;
}
async function inspectDatabase(root,file){
  const requireClient=createRequire(path.join(root,'backend/package.json'));
  const SQL=await requireClient('sql.js')();
  const bytes=fs.readFileSync(file);let db;
  try{
    db=new SQL.Database(new Uint8Array(bytes));
    if(db.exec('PRAGMA quick_check')[0]?.values[0]?.[0]!=='ok')error('O banco não passou na verificação de integridade.');
    const tables=new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map(r=>r[0]));
    for(const name of ['config','barbeiros','servicos','atendimentos','atendimento_itens'])if(!tables.has(name))error('A cópia não é um banco reconhecido deste sistema.');
    const config=key=>db.exec('SELECT valor FROM config WHERE chave=?',[key])[0]?.values[0]?.[0]||null;
    return {sha256:digest(bytes),bytes:bytes.length,instalacao:config('backup_instalacao'),
      dono:db.exec('SELECT nome FROM barbeiros WHERE is_dono=1')[0]?.values[0]?.[0]||'Não informado',
      atendimentos:db.exec('SELECT COUNT(*) FROM atendimentos')[0].values[0][0],
      ultimo_atendimento:db.exec('SELECT MAX(data_hora) FROM atendimentos')[0].values[0][0],
      referencias_invalidas:db.exec('PRAGMA foreign_key_check').length>0};
  }finally{db?.close();}
}
async function reservePort(){
  const port=Number(process.env.PORT||3000),server=net.createServer(socket=>socket.destroy());
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch{error('O sistema está aberto ou a porta está ocupada. Encerre pela janela do iniciador e tente novamente.');}
  return ()=>new Promise(resolve=>server.close(resolve));
}
function permittedFile(file){
  return /^(backend\/(?:[\w-]+\.(?:js|sql)|package\.json)|frontend\/[\w-]+\.(js|css|html)|ferramentas-suporte\/[\w-]+\.(cjs|ps1)|(?:RESTAURAR_BACKUP|RECUPERAR_ATUALIZACAO)\.bat|[A-Z_]+\.md)$/.test(file);
}
function validatePackage(folder){
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifesto.json'),'utf8'));
  if(manifest.formato!==1||typeof manifest.versao!=='string'||!Array.isArray(manifest.arquivos)||!manifest.arquivos.length)error('Pacote de atualização inválido.');
  const seen=new Set();
  for(const entry of manifest.arquivos){
    if(!permittedFile(entry.caminho)||seen.has(entry.caminho.toLowerCase()))error('Arquivo não permitido ou repetido no pacote.');seen.add(entry.caminho.toLowerCase());
    const file=safePath(path.join(folder,'arquivos'),entry.caminho),bytes=fs.readFileSync(file);
    if(digest(bytes)!==entry.sha256)error('Pacote incompleto ou alterado: '+entry.caminho);
    if(/\.(?:c?js)$/.test(file)){
      const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
      if(result.status!==0)error('Falha na validação do código: '+entry.caminho);
    }
    if(file.endsWith('.html'))for(const match of bytes.toString('utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  }
  // This update mechanism does not install dependencies or replace runtimes.
  return manifest;
}
function archive(root,operation){
  const relative='suporte/backups/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID();
  const folder=safePath(root,relative);fs.mkdirSync(folder,{recursive:true});
  return {formato:1,operacao:operation,arquivo:relative,preparado:false,itens:[],criado_em:new Date().toISOString(),pasta:folder};
}
function saveOriginal(root,journal,relative){
  const source=safePath(root,relative),exists=fs.existsSync(source);
  const item={caminho:relative,existia:exists};
  if(exists){const bytes=fs.readFileSync(source);item.sha256=digest(bytes);atomicWrite(safePath(journal.pasta,'originais/'+relative),bytes);}
  journal.itens.push(item);
}
function saveJournal(root,journal){
  writeJson(path.join(journal.pasta,'registro.json'),journal);
  writeJson(safePath(root,lockName),{formato:1,registro:journal.arquivo+'/registro.json'});
}
function verifyOriginals(journal){
  for(const item of journal.itens){
    if(!permittedFile(item.caminho)&&item.caminho!=='backend/barbearia.db')error('Registro de recuperação inválido.');
    if(item.existia&&digest(fs.readFileSync(safePath(journal.pasta,'originais/'+item.caminho)))!==item.sha256)error('A cópia anterior está incompleta. Peça suporte antes de continuar.');
  }
}
function rollback(root,journal){
  verifyOriginals(journal);
  for(const item of journal.itens){
    // Updating code never writes or rolls back the customer's live database.
    if(journal.operacao==='atualizar'&&item.caminho==='backend/barbearia.db')continue;
    const target=safePath(root,item.caminho);
    if(item.existia)atomicWrite(target,fs.readFileSync(safePath(journal.pasta,'originais/'+item.caminho)));
    else if(fs.existsSync(target))fs.unlinkSync(target);
  }
  journal.resultado='revertido';writeJson(path.join(journal.pasta,'registro.json'),journal);
}
async function maintain(root,operation,action){
  const release=await reservePort();let locked=false,journal;
  try{
    const lock=safePath(root,lockName);
    try{fs.writeFileSync(lock,JSON.stringify({formato:1,preparando:true}),{flag:'wx'});locked=true;}
    catch{error('Existe uma manutenção pendente. Execute RECUPERAR_ATUALIZACAO antes de continuar.');}
    journal=archive(root,operation);saveJournal(root,journal);
    const result=await action(journal);
    journal.resultado='concluido';writeJson(path.join(journal.pasta,'registro.json'),journal);
    fs.unlinkSync(lock);locked=false;
    return {...result,copia_anterior:journal.pasta};
  }catch(failure){
    if(locked){
      try{
        if(journal?.preparado)rollback(root,journal);
        fs.unlinkSync(safePath(root,lockName));locked=false;
      }catch(rollbackError){error(failure.message+' A recuperação automática ficou pendente: '+rollbackError.message+' Execute RECUPERAR_ATUALIZACAO e contate o suporte.');}
    }
    throw failure;
  }finally{await release();}
}
async function update(root,folder,options={}){
  root=installation(root);folder=fs.realpathSync(folder);const manifest=validatePackage(folder);
  for(const item of manifest.arquivos)safePath(root,item.caminho);
  const packageEntry=manifest.arquivos.find(f=>f.caminho==='backend/package.json');
  if(packageEntry){
    const current=JSON.parse(fs.readFileSync(path.join(root,'backend/package.json'),'utf8'));
    const next=JSON.parse(fs.readFileSync(path.join(folder,'arquivos/backend/package.json'),'utf8'));
    if(JSON.stringify(current.dependencies)!==JSON.stringify(next.dependencies))error('Esta atualização muda dependências. Solicite instalação assistida ao suporte.');
  }
  return maintain(root,'atualizar',async journal=>{
    const dbFile=safePath(root,'backend/barbearia.db');
    if(fs.existsSync(dbFile))await inspectDatabase(root,dbFile);
    saveOriginal(root,journal,'backend/barbearia.db');
    for(const item of manifest.arquivos)saveOriginal(root,journal,item.caminho);
    journal.preparado=true;journal.versao=manifest.versao;saveJournal(root,journal);
    let count=0;
    for(const item of manifest.arquivos){
      atomicWrite(safePath(root,item.caminho),fs.readFileSync(safePath(path.join(folder,'arquivos'),item.caminho)));
      if(digest(fs.readFileSync(safePath(root,item.caminho)))!==item.sha256)error('Falha ao conferir arquivo instalado.');
      // Only injectable through the module API, for failure-recovery tests.
      options.afterWrite?.(++count);
    }
    const dbOriginal=journal.itens.find(i=>i.caminho==='backend/barbearia.db');
    if(dbOriginal.existia&&digest(fs.readFileSync(dbFile))!==dbOriginal.sha256)error('O banco mudou durante a atualização. Mantenha o sistema fechado e peça suporte.');
    return {sucesso:true,versao:manifest.versao,mensagem:'Atualização concluída. Abra o sistema e pressione Ctrl+F5 no navegador.'};
  });
}
async function restore(root,file,expectedHash){
  root=installation(root);file=fs.realpathSync(file);
  return maintain(root,'restaurar',async journal=>{
    const checked=await inspectDatabase(root,file);
    if(!expectedHash||checked.sha256!==expectedHash)error('A cópia mudou desde a confirmação. Selecione e confira novamente.');
    if(checked.referencias_invalidas)error('A cópia tem referências inconsistentes. Peça análise ao suporte.');
    const target=safePath(root,'backend/barbearia.db');
    let current;
    try{if(fs.existsSync(target))current=await inspectDatabase(root,target);}catch{}
    if(current?.instalacao&&checked.instalacao&&current.instalacao!==checked.instalacao)error('A cópia pertence a outra instalação. Restauração bloqueada.');
    const bytes=fs.readFileSync(file);
    if(digest(bytes)!==expectedHash)error('A cópia foi alterada durante a leitura.');
    saveOriginal(root,journal,'backend/barbearia.db');journal.preparado=true;saveJournal(root,journal);
    atomicWrite(target,bytes);
    const result=await inspectDatabase(root,target);if(result.sha256!==checked.sha256)error('Falha na conferência do banco restaurado.');
    return {sucesso:true,mensagem:'Cópia restaurada. Abra o sistema e confira os registros e saldos.'};
  });
}
async function recover(root){
  root=installation(root);const release=await reservePort();
  try{
    const file=safePath(root,lockName);if(!fs.existsSync(file))return {sucesso:true,mensagem:'Não há manutenção pendente.'};
    const lock=JSON.parse(fs.readFileSync(file,'utf8'));
    if(lock.preparando){fs.unlinkSync(file);return {sucesso:true,mensagem:'Preparação interrompida cancelada. Nenhum arquivo havia sido alterado.'};}
    if(typeof lock.registro!=='string'||!/^suporte\/backups\/[\w.-]+\/registro\.json$/.test(lock.registro))error('Registro de recuperação inválido. Peça suporte.');
    const journal=JSON.parse(fs.readFileSync(safePath(root,lock.registro),'utf8'));
    journal.pasta=path.dirname(safePath(root,lock.registro));
    if(!['atualizar','restaurar'].includes(journal.operacao)||!Array.isArray(journal.itens))error('Registro de recuperação inválido.');
    if(journal.preparado)rollback(root,journal);
    fs.unlinkSync(file);return {sucesso:true,mensagem:'Manutenção interrompida desfeita. A versão anterior foi preservada.',copia_anterior:journal.pasta};
  }finally{await release();}
}
module.exports={update,restore,recover,inspectDatabase,validatePackage};
if(require.main===module){
  const [mode,root,file,hash]=process.argv.slice(2);
  Promise.resolve().then(()=>mode==='atualizar'?update(root,file):mode==='restaurar'?restore(root,file,hash):mode==='recuperar'?recover(root):mode==='inspecionar'?inspectDatabase(installation(root),file):error('Operação desconhecida.'))
    .then(result=>console.log(JSON.stringify(result)))
    .catch(failure=>{console.error(JSON.stringify({sucesso:false,erro:failure.message}));process.exitCode=1;});
}
