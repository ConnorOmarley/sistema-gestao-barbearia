import { fork, spawn } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

if(existsSync(fileURLToPath(new URL('./suporte-manutencao.json',import.meta.url)))) {
  console.error('Manutencao pendente. Aguarde ou execute RECUPERAR_ATUALIZACAO.bat antes de abrir.');
  process.exit(1);
}

const port=Number(process.env.PORT || 3000);
const probe=createServer();
try {
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve);});
  await new Promise(resolve=>probe.close(resolve));
} catch {
  console.error('A porta '+port+' está em uso. Feche a outra janela do sistema antes de iniciar novamente.');
  process.exit(1);
}
const child=fork(fileURLToPath(new URL('./server.js',import.meta.url)),[],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});
let stopping=false;
function stop() {
  if(stopping)return;
  stopping=true;
  console.log('Salvando e encerrando...');
  if(child.connected)child.send('shutdown');
}
child.on('message',message=>{
  if(message!=='ready')return;
  spawn('explorer.exe',['http://localhost:'+port],{windowsHide:true,stdio:'ignore'}).on('error',()=>console.log('Abra http://localhost:'+port+' no navegador.'));
  console.log('Sistema em funcionamento. Pressione ENTER para salvar e encerrar antes de retirar o pen drive.');
  process.stdin.resume();
  process.stdin.on('data',stop);
  process.stdin.on('end',stop);
});
child.on('exit',code=>{console.log('Servidor encerrado.');process.exit(code || 0);});
child.on('error',error=>{console.error(error.message);process.exit(1);});
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
