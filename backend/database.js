import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, isAbsolute, relative } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, renameSync, openSync, closeSync, fsyncSync } from 'fs';
import { randomBytes } from 'crypto';
import { isPigmentacao } from './rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(__dirname,'suporte-manutencao.json'))) {
  throw new Error('Há uma manutenção pendente. Aguarde sua conclusão ou execute RECUPERAR_ATUALIZACAO antes de abrir o sistema.');
}
const dbPath = join(__dirname, 'barbearia.db');
const backupsDir = join(__dirname, 'backups');
const MAX_BACKUPS = 20;
const SQL = await initSqlJs();
const original = existsSync(dbPath) ? readFileSync(dbPath) : null;
let db = original ? new SQL.Database(new Uint8Array(original)) : new SQL.Database();
let inTransaction = false;
let ready = false;
let lastSaved = original;
let backupError = null, externalError = null, lastBackup = null, lastExternal = null;
if (original && db.exec('PRAGMA quick_check')[0]?.values[0]?.[0] !== 'ok') {
  throw new Error('Banco com falha de integridade. Preserve os arquivos e restaure uma cópia válida.');
}

function atomicWrite(path, data) {
  const temp = path + '.tmp-' + process.pid + '-' + randomBytes(4).toString('hex');
  try {
    writeFileSync(temp, data, { flag: 'wx' });
    const fd = openSync(temp, 'r+');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, path);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}
// sql.js reopens its connection during export.
function snapshot() {
  try { return db.export(); }
  finally { db.run('PRAGMA foreign_keys = ON'); }
}
function saveDatabase() {
  if (!inTransaction) {
    const bytes = snapshot();
    if (!lastSaved || !Buffer.from(bytes).equals(Buffer.from(lastSaved))) {
      atomicWrite(dbPath, bytes);
      lastSaved = bytes;
    }
  }
}
function transaction(action) {
  if (inTransaction) return action();
  const before = lastSaved || snapshot();
  inTransaction = true;
  try {
    db.run('BEGIN IMMEDIATE');
    const result = action();
    db.run('COMMIT');
    inTransaction = false;
    saveDatabase();
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch {}
    db.close();
    db = new SQL.Database(new Uint8Array(before));
    db.run('PRAGMA foreign_keys = ON');
    throw error;
  } finally { inTransaction = false; }
}
function getConfig(chave) {
  return db.exec('SELECT valor FROM config WHERE chave = ?', [chave])[0]?.values[0]?.[0] ?? null;
}
function setConfig(chave, valor) {
  transaction(() => db.run('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', [chave, valor]));
}
function pruneBackups(folder, pattern, keep) {
  const files = readdirSync(folder).filter(f => pattern.test(f)).sort();
  for (const file of files.slice(0, Math.max(0, files.length - keep))) unlinkSync(join(folder,file));
}
function calendarBackups(folder, bytes, date = new Date()) {
  const day = [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  atomicWrite(join(folder,'barbearia-diario-'+day+'.db'),bytes);
  atomicWrite(join(folder,'barbearia-mensal-'+day.slice(0,7)+'.db'),bytes);
  pruneBackups(folder,/^barbearia-diario-\d{4}-\d{2}-\d{2}\.db$/,30);
  pruneBackups(folder,/^barbearia-mensal-\d{4}-\d{2}\.db$/,12);
}
function externalBackup() {
  const destination = getConfig('backup_externo');
  if (!destination) { externalError=null; return; }
  try {
    // Do not recreate a missing device/network root: retry when it is connected.
    if (!existsSync(destination)) throw new Error('A pasta de destino está indisponível.');
    const folder=join(destination,'barbearia-'+getConfig('backup_instalacao'));
    mkdirSync(folder,{recursive:true});
    calendarBackups(folder,lastSaved);
    lastExternal=new Date().toISOString();externalError=null;
  } catch(error) { externalError=error.message;console.error('Backup externo pendente:',error.message); }
}
function backupDatabase() {
  try {
    saveDatabase();
    mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupsDir, 'barbearia-' + stamp + '-' + randomBytes(4).toString('hex') + '.db');
    atomicWrite(backupPath,lastSaved);
    calendarBackups(backupsDir,lastSaved);
    pruneBackups(backupsDir,/^barbearia-\d{4}-\d{2}-\d{2}T[\w.-]+\.db$/,MAX_BACKUPS);
    lastBackup=new Date().toISOString();backupError=null;
    externalBackup();
    return backupPath;
  } catch(error) { backupError=error.message;throw error; }
}
function backupStatus() {
  return {ultimo_local:lastBackup,erro_local:backupError,pasta_externa:getConfig('backup_externo')||'',ultimo_externo:lastExternal,erro_externo:externalError,retencao:{recentes:20,diarios:30,mensais:12}};
}
function configureExternalBackup(value) {
  if(typeof value!=='string') throw Object.assign(new Error('Informe a pasta de backup.'),{status:400});
  const destination=value.trim();
  if(destination) {
    const rel=relative(__dirname,resolve(destination));
    if(!isAbsolute(destination)||!rel||(!rel.startsWith('..')&&!isAbsolute(rel))) throw Object.assign(new Error('Escolha uma pasta absoluta fora da pasta do banco, de preferência em outro dispositivo.'),{status:400});
    if(!existsSync(destination)) throw Object.assign(new Error('A pasta não existe ou está desconectada.'),{status:400});
  }
  setConfig('backup_externo',destination?resolve(destination):'');
  lastExternal=null;
  externalBackup();
  return backupStatus();
}

// Preserve the original bytes before any schema operation in this release.
const previousVersion = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='config'").length ? getConfig('schema_version') : null;
if (original && previousVersion !== '3') atomicWrite(join(__dirname,'barbearia-antes-migracao-v3-'+Date.now()+'.db'),original);
db.run(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
const addColumn = (table, column, definition) => {
  if (!db.exec('PRAGMA table_info(' + table + ')')[0].values.some(row => row[1] === column)) db.run('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
};
addColumn('barbeiros', 'foto', 'TEXT');
addColumn('servicos', 'comissao_fixa_pct', 'REAL');
addColumn('atendimentos', 'metodo_pagamento', "TEXT NOT NULL DEFAULT 'dinheiro'");
db.run('CREATE TABLE IF NOT EXISTS gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, categoria TEXT NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL, metodo_pagamento TEXT NOT NULL, data_hora TEXT NOT NULL, observacao TEXT)');
if (!['2','3'].includes(getConfig('schema_version'))) {
  // Preserve the exact pre-migration bytes, outside the rotating backups.

  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN');
  try {
    db.run('ALTER TABLE atendimento_itens RENAME TO atendimento_itens_v1');
    db.run(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
    db.run('INSERT INTO atendimento_itens SELECT * FROM atendimento_itens_v1');
    db.run('DROP TABLE atendimento_itens_v1');
    db.run('CREATE INDEX IF NOT EXISTS idx_itens_atendimento ON atendimento_itens(atendimento_id)');
    db.run('INSERT INTO atendimento_itens (atendimento_id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, comissao_percentual, valor_comissao) SELECT a.id, a.servico_id, a.valor_cobrado, a.valor_tinta, a.tem_pigmentacao, a.comissao_percentual, a.valor_comissao FROM atendimentos a WHERE NOT EXISTS (SELECT 1 FROM atendimento_itens i WHERE i.atendimento_id = a.id)');
    for (const [id, nome] of db.exec('SELECT id, nome FROM servicos')[0]?.values || []) {
      if (isPigmentacao(nome)) db.run('UPDATE servicos SET comissao_fixa_pct = 0 WHERE id = ?', [id]);
    }
    db.run("INSERT OR REPLACE INTO config VALUES ('schema_version', '2')");
    db.run('COMMIT');
  } catch (error) { db.run('ROLLBACK'); throw error; }
}
db.run("INSERT OR REPLACE INTO config VALUES ('schema_version','3')");
db.run('CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos(data_hora)');
db.run('PRAGMA foreign_keys = ON');
// Preserve legacy duplicates; reject any new duplicate.
db.run("CREATE TRIGGER IF NOT EXISTS itens_sem_repeticao_insert BEFORE INSERT ON atendimento_itens WHEN EXISTS (SELECT 1 FROM atendimento_itens WHERE atendimento_id=NEW.atendimento_id AND servico_id=NEW.servico_id) BEGIN SELECT RAISE(ABORT, 'Servico repetido no atendimento'); END");
db.run("CREATE TRIGGER IF NOT EXISTS itens_sem_repeticao_update BEFORE UPDATE OF atendimento_id, servico_id ON atendimento_itens WHEN (OLD.atendimento_id != NEW.atendimento_id OR OLD.servico_id != NEW.servico_id) AND EXISTS (SELECT 1 FROM atendimento_itens WHERE atendimento_id=NEW.atendimento_id AND servico_id=NEW.servico_id AND id != NEW.id) BEGIN SELECT RAISE(ABORT, 'Servico repetido no atendimento'); END");
if (!db.exec('SELECT 1 FROM atendimento_itens GROUP BY atendimento_id, servico_id HAVING COUNT(*) > 1').length) db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_item_servico_unico ON atendimento_itens(atendimento_id, servico_id)');
if (db.exec('PRAGMA foreign_key_check').length) console.warn('Referências antigas inconsistentes: dados preservados. Revise o backup anterior à migração.');
transaction(() => {
  if (!getConfig('backup_instalacao')) db.run("INSERT INTO config VALUES ('backup_instalacao',?)",[randomBytes(12).toString('hex')]);
  if (!db.exec('SELECT 1 FROM barbeiros WHERE is_dono = 1').length) db.run("INSERT INTO barbeiros (nome,comissao_percentual,is_dono,ativo) VALUES ('Michael Barber',100,1,1)");
  if (!db.exec('SELECT 1 FROM servicos').length) {
    for (const [nome,valor,pct] of [['Corte Simples',30,null],['Barba',20,null],['Corte + Barba',45,null],['Pigmentação',80,0]]) db.run('INSERT INTO servicos (nome,valor,comissao_fixa_pct) VALUES (?,?,?)',[nome,valor,pct]);
  }
});
ready = true;
function safeSave() {
  try { if (ready) saveDatabase(); } catch (error) { console.error('Falha ao salvar banco:', error.message); }
}
// Every successful transaction is persisted before returning; no idle rewrites.
const backupTimer = setInterval(() => {
  try { backupDatabase(); } catch (error) { console.error('Falha ao criar backup:', error.message); }
}, 5 * 60 * 1000);
function closeDatabase() {
  saveDatabase();

  clearInterval(backupTimer);
}
try { backupDatabase(); } catch(error) { console.error('Falha ao criar backup inicial:',error.message); }
process.on('exit', safeSave);
export { db as default, saveDatabase, backupDatabase, backupsDir, getConfig, setConfig, transaction, closeDatabase, backupStatus, configureExternalBackup, calendarBackups };
