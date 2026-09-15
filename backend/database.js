import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'barbearia.db');

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
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS atendimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barbeiro_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    valor_cobrado REAL NOT NULL,
    comissao_percentual REAL NOT NULL,
    valor_comissao REAL NOT NULL,
    data_hora TEXT NOT NULL,
    observacao TEXT,
    FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON atendimentos(data_hora);
  CREATE INDEX IF NOT EXISTS idx_atendimentos_barbeiro ON atendimentos(barbeiro_id);
`);

const donoExists = db.exec('SELECT 1 FROM barbeiros WHERE is_dono = 1');
if (donoExists.length === 0) {
  db.run(`INSERT INTO barbeiros (nome, comissao_percentual, is_dono, ativo) VALUES ('Dono', 100, 1, 1)`);
}

const servicoExists = db.exec('SELECT 1 FROM servicos WHERE apenas_dono = 1');
if (servicoExists.length === 0) {
  db.run(`INSERT INTO servicos (nome, valor, apenas_dono, ativo) VALUES ('Pintar Cabelo', 80.00, 1, 1)`);
}

function saveDatabase() {
  const data = db.export();
  writeFileSync(dbPath, data);
}

setInterval(saveDatabase, 5000);

process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit();
});

export default db;
export { saveDatabase };
