import initSqlJs from 'sql.js';
import {readFileSync} from 'node:fs';
const file=process.argv[2];
if(!file){console.error('Uso: node verificar-backup.js caminho-da-copia.db');process.exit(1);}
let db;
try{
  const SQL=await initSqlJs();db=new SQL.Database(readFileSync(file));
  if(db.exec('PRAGMA quick_check')[0]?.values[0]?.[0]!=='ok')throw Error('Falha de integridade.');
  const tables=new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map(v=>v[0]));
  for(const t of ['config','atendimentos','atendimento_itens','barbeiros','servicos'])if(!tables.has(t))throw Error('Tabela ausente: '+t);
  if(db.exec('PRAGMA foreign_key_check').length)throw Error('Há referências inconsistentes. Solicite análise antes de restaurar.');
  console.log('Cópia válida estruturalmente. Confira também a data e se pertence à barbearia correta. Nenhum arquivo foi alterado.');
}catch(error){console.error('Não restaure esta cópia sem análise: '+error.message);process.exitCode=1;}
finally{db?.close();}
