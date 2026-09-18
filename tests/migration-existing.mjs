import assert from 'node:assert/strict';
import {readFileSync,copyFileSync,mkdirSync,mkdtempSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import initSqlJs from '../backend/node_modules/sql.js/dist/sql-wasm.js';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const temp=join(root,'backend','.testdata');mkdirSync(temp,{recursive:true});
const dir=mkdtempSync(join(temp,'existing-'));
for(const f of ['database.js','rules.js','schema.sql'])copyFileSync(join(root,'backend',f),join(dir,f));
const original=readFileSync(join(root,'backend','barbearia.db'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const SQL=await initSqlJs(),before=new SQL.Database(original);
copyFileSync(join(root,'backend','barbearia.db'),join(dir,'barbearia.db'));
const tables=['barbeiros','servicos','atendimentos','atendimento_itens','gastos'];
const rows=(db,t)=>JSON.stringify(db.exec('SELECT * FROM '+t+' ORDER BY id'));
const expected=Object.fromEntries(tables.map(t=>[t,rows(before,t)]));
const config=JSON.stringify(before.exec("SELECT * FROM config WHERE chave!='schema_version' ORDER BY chave"));
const migrated=await import(pathToFileURL(join(dir,'database.js')));
try{
 for(const t of tables)assert.equal(rows(migrated.default,t),expected[t],t+' deve preservar dados');
 assert.equal(JSON.stringify(migrated.default.exec("SELECT * FROM config WHERE chave!='schema_version' ORDER BY chave")),config);
 assert.equal(migrated.getConfig('schema_version'),'3');
 const backup=readdirSync(dir).find(f=>f.startsWith('barbearia-antes-migracao'));
 if(backup)assert.equal(hash(readFileSync(join(dir,backup))),hash(original));
 assert.equal(hash(readFileSync(join(root,'backend','barbearia.db'))),hash(original));
 console.log('PASS migração da cópia do banco real: todas as tabelas e senha preservadas; banco original intacto.');
}finally{migrated.closeDatabase();before.close();}
