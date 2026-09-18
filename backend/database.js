import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'barbearia.db');
const backupsDir = join(__dirname, 'backups');
const MAX_BACKUPS = 20;

const SQL = await initSqlJs();
let db;

if (existsSync(dbPath)) {
  const buffer = readFileSync(dbPath);
  db = new SQL.Database(buffer);
} else {
  db = new SQL.Database();
}

db.run(`
  CREATE TABLE IF NOT EXISTS barbeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    comissao_percentual REAL NOT NULL,
    is_dono INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    valor REAL NOT NULL,
    apenas_dono INTEGER DEFAULT 0,
    comissao_fixa_pct REAL DEFAULT NULL,
    ativo INTEGER DEFAULT 1
  );

CREATE TABLE IF NOT EXISTS atendimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barbeiro_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    valor_cobrado REAL NOT NULL,
    valor_tinta REAL DEFAULT 0,
    tem_pigmentacao INTEGER DEFAULT 0,
    comissao_percentual REAL NOT NULL,
    valor_comissao REAL NOT NULL,
    data_hora TEXT NOT NULL,
    observacao TEXT,
    FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  );

  CREATE TABLE IF NOT EXISTS atendimento_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atendimento_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    valor_cobrado REAL NOT NULL,
    valor_tinta REAL DEFAULT 0,
    tem_pigmentacao INTEGER DEFAULT 0,
    comissao_percentual REAL NOT NULL,
    valor_comissao REAL NOT NULL,
    FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON atendimentos(data_hora);
  CREATE INDEX IF NOT EXISTS idx_atendimentos_barbeiro ON atendimentos(barbeiro_id);
  CREATE INDEX IF NOT EXISTS idx_itens_atendimento ON atendimento_itens(atendimento_id);
`);

// Migração: transforma atendimentos antigos (serviço único) em itens.
const temItens = db.exec('SELECT 1 FROM atendimento_itens');
if (temItens.length === 0) {
  const antigos = db.exec('SELECT id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, comissao_percentual, valor_comissao FROM atendimentos');
  if (antigos.length > 0 && antigos[0].values.length > 0) {
    for (const row of antigos[0].values) {
      db.run('INSERT INTO atendimento_itens (atendimento_id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, comissao_percentual, valor_comissao) VALUES (?, ?, ?, ?, ?, ?, ?)', row);
    }
    saveDatabase();
  }
}

try { db.run('ALTER TABLE barbeiros ADD COLUMN foto TEXT'); } catch (e) {}

try { db.run('ALTER TABLE servicos ADD COLUMN comissao_fixa_pct REAL'); } catch (e) {}
db.run("UPDATE servicos SET comissao_fixa_pct = 0, apenas_dono = 0 WHERE comissao_fixa_pct IS NULL AND (nome LIKE 'Pigmenta%' OR nome LIKE 'Pintar%')");

const donoExists = db.exec('SELECT 1 FROM barbeiros WHERE is_dono = 1');
if (donoExists.length === 0) {
  db.run(`INSERT INTO barbeiros (nome, comissao_percentual, is_dono, ativo) VALUES ('Michael Barber', 100, 1, 1)`);
}

const servicoExists = db.exec('SELECT 1 FROM servicos');
if (servicoExists.length === 0) {
  db.run(`INSERT INTO servicos (nome, valor, apenas_dono, ativo, comissao_fixa_pct) VALUES ('Corte Simples', 30.00, 0, 1, NULL)`);
  db.run(`INSERT INTO servicos (nome, valor, apenas_dono, ativo, comissao_fixa_pct) VALUES ('Barba', 20.00, 0, 1, NULL)`);
  db.run(`INSERT INTO servicos (nome, valor, apenas_dono, ativo, comissao_fixa_pct) VALUES ('Corte + Barba', 45.00, 0, 1, NULL)`);
  db.run(`INSERT INTO servicos (nome, valor, apenas_dono, ativo, comissao_fixa_pct) VALUES ('Pigmentação', 80.00, 0, 1, 0)`);
}

function saveDatabase() {
  const data = db.export();
  writeFileSync(dbPath, data);
}

function backupDatabase() {
  saveDatabase();
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
  }
  const date = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const backupPath = join(backupsDir, `barbearia-${stamp}.db`);
  writeFileSync(backupPath, db.export());
  const backups = readdirSync(backupsDir)
    .filter(f => f.startsWith('barbearia-') && f.endsWith('.db'))
    .sort();
  while (backups.length > MAX_BACKUPS) {
    unlinkSync(join(backupsDir, backups.shift()));
  }
  return backupPath;
}

setInterval(saveDatabase, 5000);
setInterval(backupDatabase, 5 * 60 * 1000);

function getConfig(chave) {
  const result = db.exec('SELECT valor FROM config WHERE chave = ?', [chave]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0];
}

function setConfig(chave, valor) {
  db.run('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', [chave, valor]);
  saveDatabase();
}

process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit();
});

export default db;
export { saveDatabase, backupDatabase, backupsDir, getConfig, setConfig };
