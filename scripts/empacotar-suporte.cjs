const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.SUPORTE_PROJECT||path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Informe uma pasta nova para gerar o pacote.');
if(fs.existsSync(output))throw Error('A pasta de saída já existe. Escolha uma pasta nova.');
const version='2026.09-suporte-1';
const copy=(relative,target)=>{
 let bytes=fs.readFileSync(path.join(root,relative));
 if(/\.(ps1|bat)$/.test(relative)){
  const text=bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r?\n/g,'\r\n');
  bytes=Buffer.from((relative.endsWith('.ps1')?'\uFEFF':'')+text,'utf8');
 }
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return bytes;
};
for(const file of ['ATUALIZAR_SISTEMA.bat','RECUPERAR_ATUALIZACAO.bat','LEIA_PRIMEIRO.txt','ferramentas-suporte/suporte.cjs','ferramentas-suporte/suporte.ps1'])copy(file,path.join(output,file));
const files=[
 'backend/launcher.js','backend/database.js',
 ...['server.js','finance.js','rules.js','photos.js','schema.sql','package.json','verificar-backup.js'].map(f=>'backend/'+f),
 ...fs.readdirSync(path.join(root,'frontend')).filter(f=>/^[\w-]+\.(js|css|html)$/.test(f)).map(f=>'frontend/'+f),
 'ferramentas-suporte/suporte.cjs','ferramentas-suporte/suporte.ps1',
 'RESTAURAR_BACKUP.bat','RECUPERAR_ATUALIZACAO.bat','GUIA_SUPORTE.md','ATUALIZACAO_CONFIABILIDADE.md'
];
const entries=files.map(file=>({caminho:file,sha256:crypto.createHash('sha256').update(copy(file,path.join(output,'pacote/arquivos',file))).digest('hex')}));
fs.writeFileSync(path.join(output,'pacote/manifesto.json'),JSON.stringify({formato:1,versao:version,arquivos:entries},null,2));
console.log('Pacote preparado em '+output+'. Compacte o conteúdo dessa pasta em ZIP.');
