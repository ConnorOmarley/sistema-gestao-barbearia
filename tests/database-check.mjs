import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {readFileSync,renameSync,mkdirSync,rmdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import db,{transaction,saveDatabase,backupDatabase,closeDatabase} from './database.js';
const path=fileURLToPath(new URL('barbearia.db',import.meta.url));
const count=()=>db.exec('SELECT COUNT(*) FROM atendimentos')[0].values[0][0];
const insert=()=>db.run("INSERT INTO atendimentos (barbeiro_id,servico_id,valor_cobrado,valor_comissao,comissao_percentual,data_hora) VALUES (1,1,100,100,100,'2026-09-18T12:00:00.000Z')");
try {
 saveDatabase();assert.equal(db.exec('PRAGMA foreign_keys')[0].values[0][0],1);
 assert.throws(()=>transaction(()=>db.run('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,comissao_percentual,valor_comissao) VALUES (999999,1,100,100,100)')));
 console.log('PASS integridade referencial ativa inclusive após exportação');
 const before=count();
 assert.throws(()=>transaction(()=>{insert();throw Error('falha simulada')}));assert.equal(count(),before);
 transaction(()=>db.run("INSERT OR REPLACE INTO config VALUES ('rollback_teste','confirmado')"));
 const rollbackSQL=await initSqlJs(),persisted=new rollbackSQL.Database(new Uint8Array(readFileSync(path)));
 assert.equal(persisted.exec("SELECT valor FROM config WHERE chave='rollback_teste'")[0]?.values[0]?.[0],'confirmado');persisted.close();
 console.log('PASS rollback e persistência de operação posterior');
 const bytes=readFileSync(path);
 renameSync(path,path+'.good');mkdirSync(path);
 try {assert.throws(()=>transaction(insert));assert.equal(count(),before);}
 finally {rmdirSync(path);renameSync(path+'.good',path);}
 assert.deepEqual(readFileSync(path),bytes);
 console.log('PASS falha de gravação preserva memória e último banco válido');
 transaction(()=>{
  insert();const id=db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  db.run('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,comissao_percentual,valor_comissao) VALUES (?,1,100,100,100)',[id]);
  assert.throws(()=>db.run('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,comissao_percentual,valor_comissao) VALUES (?,1,100,100,100)',[id]));
  db.run('DELETE FROM atendimentos WHERE id=?',[id]);assert.equal(db.exec('SELECT COUNT(*) FROM atendimento_itens WHERE atendimento_id=?',[id])[0].values[0][0],0);
 });
 console.log('PASS duplicidade rejeitada no banco e exclusão em cascata');
 for(let i=0;i<25;i++)backupDatabase();
 assert.equal(readdirSync(new URL('backups/',import.meta.url)).filter(f=>/^barbearia-\d{4}-\d{2}-\d{2}T/.test(f)).length,20);
 console.log('PASS retenção de 20 backups');
}finally{closeDatabase()}
