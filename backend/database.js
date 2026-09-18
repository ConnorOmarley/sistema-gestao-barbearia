import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync, renameSync, openSync, closeSync, fsyncSync } from 'fs';
import { randomBytes } from 'crypto';
import { isPigmentacao } from './rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'barbearia.db');
const backupsDir = join(__dirname, 'backups');
const MAX_BACKUPS = 20;
const SQL = await initSqlJs();
const original = existsSync(dbPath) ? readFileSync(dbPath) : null;
let db = original ? new SQL.Database(new Uint8Array(original)) : new SQL.Database();
let inTransaction = false;
let ready = false;

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
  if (!inTransaction) atomicWrite(dbPath, snapshot());
}
function transaction(action) {
  if (inTransaction) return action();
  const before = snapshot();
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
    db = new SQL.Database(before);
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
function backupDatabase() {
  saveDatabase();
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupsDir, 'barbearia-' + stamp + '-' + randomBytes(4).toString('hex') + '.db');
  atomicWrite(backupPath, snapshot());
  const backups = readdirSync(backupsDir).filter(f => /^barbearia-[\w.-]+\.db$/.test(f)).sort();
  while (backups.length > MAX_BACKUPS) unlinkSync(join(backupsDir, backups.shift()));
  return backupPath;
}

db.run(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
const addColumn = (table, column, definition) => {
  if (!db.exec('PRAGMA table_info(' + table + ')')[0].values.some(row => row[1] === column)) db.run('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
};
addColumn('barbeiros', 'foto', 'TEXT');
addColumn('servicos', 'comissao_fixa_pct', 'REAL');
if (getConfig('schema_version') !== '2') {
  // Preserve the exact pre-migration bytes, outside the rotating backups.
  if (original) atomicWrite(join(__dirname, 'barbearia-antes-migracao-v2-' + Date.now() + '.db'), original);
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
      if (isPigmentacao(nome)) db.run('UPDATE servicos SET comissao_fixa_pct = 0, apenas_dono = 1 WHERE id = ?', [id]);
    }
    db.run("INSERT OR REPLACE INTO config VALUES ('schema_version', '2')");
    db.run('COMMIT');
  } catch (error) { db.run('ROLLBACK'); throw error; }
}
db.run('PRAGMA foreign_keys = ON');
// Preserve legacy duplicates; reject any new duplicate.
db.run("CREATE TRIGGER IF NOT EXISTS itens_sem_repeticao_insert BEFORE INSERT ON atendimento_itens WHEN EXISTS (SELECT 1 FROM atendimento_itens WHERE atendimento_id=NEW.atendimento_id AND servico_id=NEW.servico_id) BEGIN SELECT RAISE(ABORT, 'Servico repetido no atendimento'); END");
db.run("CREATE TRIGGER IF NOT EXISTS itens_sem_repeticao_update BEFORE UPDATE OF atendimento_id, servico_id ON atendimento_itens WHEN (OLD.atendimento_id != NEW.atendimento_id OR OLD.servico_id != NEW.servico_id) AND EXISTS (SELECT 1 FROM atendimento_itens WHERE atendimento_id=NEW.atendimento_id AND servico_id=NEW.servico_id AND id != NEW.id) BEGIN SELECT RAISE(ABORT, 'Servico repetido no atendimento'); END");
if (!db.exec('SELECT 1 FROM atendimento_itens GROUP BY atendimento_id, servico_id HAVING COUNT(*) > 1').length) db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_item_servico_unico ON atendimento_itens(atendimento_id, servico_id)');
if (db.exec('PRAGMA foreign_key_check').length) console.warn('Referências antigas inconsistentes: dados preservados. Revise o backup anterior à migração.');
transaction(() => {
  if (!db.exec('SELECT 1 FROM barbeiros WHERE is_dono = 1').length) db.run("INSERT INTO barbeiros (nome,comissao_percentual,is_dono,ativo) VALUES ('Michael Barber',100,1,1)");
  if (!db.exec('SELECT 1 FROM servicos').length) {
    for (const [nome,valor,pct] of [['Corte Simples',30,null],['Barba',20,null],['Corte + Barba',45,null],['Pigmentação',80,0]]) db.run('INSERT INTO servicos (nome,valor,comissao_fixa_pct) VALUES (?,?,?)',[nome,valor,pct]);
  }
});
ready = true;
function safeSave() {
  try { if (ready) saveDatabase(); } catch (error) { console.error('Falha ao salvar banco:', error.message); }
}
const saveTimer = setInterval(safeSave, 5000);
const backupTimer = setInterval(() => {
  try { backupDatabase(); } catch (error) { console.error('Falha ao criar backup:', error.message); }
}, 5 * 60 * 1000);
function closeDatabase() {
  saveDatabase();
  clearInterval(saveTimer);
  clearInterval(backupTimer);
}
process.on('exit', safeSave);
export { db as default, saveDatabase, backupDatabase, backupsDir, getConfig, setConfig, transaction, closeDatabase };
