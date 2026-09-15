import express from 'express';
import cors from 'cors';
import { join, basename } from 'path';
import { existsSync, readdirSync } from 'fs';
import db, { saveDatabase, backupDatabase, backupsDir } from './database.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

function exec(query, params = []) {
  const result = db.exec(query, params);
  saveDatabase();
  return result;
}

function getAll(query, params = []) {
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  const values = result[0].values;
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function getOne(query, params = []) {
  const results = getAll(query, params);
  return results.length > 0 ? results[0] : null;
}

function run(query, params = []) {
  db.run(query, params);
  saveDatabase();
  const result = getAll('SELECT last_insert_rowid() as id');
  return result[0].id;
}

app.get('/api/barbeiros', (req, res) => {
  const barbeiros = getAll('SELECT * FROM barbeiros WHERE ativo = 1 ORDER BY nome');
  res.json(barbeiros);
});

app.post('/api/barbeiros', (req, res) => {
  const { nome, comissao_percentual, is_dono } = req.body;
  const id = run('INSERT INTO barbeiros (nome, comissao_percentual, is_dono) VALUES (?, ?, ?)', [nome, comissao_percentual, is_dono || 0]);
  res.json({ id, nome, comissao_percentual, is_dono: is_dono || 0 });
});

app.put('/api/barbeiros/:id', (req, res) => {
  const { nome, comissao_percentual } = req.body;
  db.run('UPDATE barbeiros SET nome = ?, comissao_percentual = ? WHERE id = ?', [nome, comissao_percentual, req.params.id]);
  saveDatabase();
  res.json({ id: req.params.id, nome, comissao_percentual });
});

app.delete('/api/barbeiros/:id', (req, res) => {
  db.run('UPDATE barbeiros SET ativo = 0 WHERE id = ? AND is_dono = 0', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.get('/api/servicos', (req, res) => {
  const servicos = getAll('SELECT * FROM servicos WHERE ativo = 1 ORDER BY nome');
  res.json(servicos);
});

app.post('/api/servicos', (req, res) => {
  const { nome, valor, apenas_dono } = req.body;
  const id = run('INSERT INTO servicos (nome, valor, apenas_dono) VALUES (?, ?, ?)', [nome, valor, apenas_dono || 0]);
  res.json({ id, nome, valor, apenas_dono: apenas_dono || 0 });
});

app.put('/api/servicos/:id', (req, res) => {
  const { nome, valor } = req.body;
  db.run('UPDATE servicos SET nome = ?, valor = ? WHERE id = ?', [nome, valor, req.params.id]);
  saveDatabase();
  res.json({ id: req.params.id, nome, valor });
});

app.delete('/api/servicos/:id', (req, res) => {
  db.run('UPDATE servicos SET ativo = 0 WHERE id = ? AND apenas_dono = 0', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.post('/api/atendimentos', (req, res) => {
  const { barbeiro_id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, observacao } = req.body;
  
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ?', [barbeiro_id]);
  const servico = getOne('SELECT * FROM servicos WHERE id = ?', [servico_id]);
  
  if (!barbeiro || !servico) {
    return res.status(400).json({ error: 'Barbeiro ou serviço não encontrado' });
  }
  
  if (servico.apenas_dono && !barbeiro.is_dono) {
    return res.status(400).json({ error: 'Este serviço só pode ser feito pelo dono' });
  }
  
  const comissao_percentual = barbeiro.comissao_percentual;
  
  let valor_para_comissao = valor_cobrado;
  if (tem_pigmentacao && valor_tinta > 0) {
    valor_para_comissao = valor_cobrado - valor_tinta;
  }
  
  const valor_comissao = (valor_para_comissao * comissao_percentual) / 100;
  const data_hora = new Date().toISOString();
  
  const id = run(`
    INSERT INTO atendimentos (barbeiro_id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, comissao_percentual, valor_comissao, data_hora, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [barbeiro_id, servico_id, valor_cobrado, valor_tinta || 0, tem_pigmentacao ? 1 : 0, comissao_percentual, valor_comissao, data_hora, observacao]);
  
  res.json({
    id,
    barbeiro_id,
    servico_id,
    valor_cobrado,
    valor_tinta: valor_tinta || 0,
    tem_pigmentacao: tem_pigmentacao ? 1 : 0,
    comissao_percentual,
    valor_comissao,
    data_hora
  });
});

app.get('/api/atendimentos', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  
  let query = `
    SELECT 
      a.*,
      b.nome as barbeiro_nome,
      s.nome as servico_nome
    FROM atendimentos a
    JOIN barbeiros b ON a.barbeiro_id = b.id
    JOIN servicos s ON a.servico_id = s.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (data_inicio) {
    query += ' AND a.data_hora >= ?';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND a.data_hora <= ?';
    params.push(data_fim);
  }
  
  query += ' ORDER BY a.data_hora DESC';
  
  const atendimentos = getAll(query, params);
  res.json(atendimentos);
});

app.get('/api/relatorio/comissoes', (req, res) => {
  const { data_inicio, data_fim, periodo } = req.query;
  
  let query = `
    SELECT 
      b.id,
      b.nome,
      b.is_dono,
      COUNT(a.id) as total_atendimentos,
      SUM(a.valor_cobrado) as total_faturado,
      SUM(a.valor_tinta) as total_tinta,
      SUM(a.valor_comissao) as total_comissao_colaborador,
      SUM(a.valor_cobrado - a.valor_comissao) as total_barbearia
    FROM barbeiros b
    LEFT JOIN atendimentos a ON b.id = a.barbeiro_id
  `;
  
  const params = [];
  
  if (data_inicio || data_fim) {
    query += ' WHERE 1=1';
    
    if (data_inicio) {
      query += ' AND a.data_hora >= ?';
      params.push(data_inicio);
    }
    
    if (data_fim) {
      query += ' AND a.data_hora <= ?';
      params.push(data_fim);
    }
  }
  
  query += ' GROUP BY b.id, b.nome, b.is_dono ORDER BY b.nome';
  
  const relatorio = getAll(query, params);
  res.json(relatorio);
});

app.get('/api/relatorio/geral', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  
  let query = `
    SELECT 
      SUM(valor_cobrado) as total_geral,
      SUM(valor_tinta) as total_tinta,
      SUM(valor_comissao) as total_colaboradores,
      SUM(valor_cobrado - valor_comissao) as total_barbearia,
      COUNT(id) as total_atendimentos
    FROM atendimentos
    WHERE 1=1
  `;
  
  const params = [];
  
  if (data_inicio) {
    query += ' AND data_hora >= ?';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    query += ' AND data_hora <= ?';
    params.push(data_fim);
  }
  
  const resultado = getOne(query, params);
  res.json(resultado || {
    total_geral: 0,
    total_tinta: 0,
    total_colaboradores: 0,
    total_barbearia: 0,
    total_atendimentos: 0
  });
});

app.post('/api/backup', (req, res) => {
  const backupPath = backupDatabase();
  res.json({ success: true, arquivo: basename(backupPath) });
});

app.get('/api/backup', (req, res) => {
  const { arquivo } = req.query;
  if (arquivo) {
    const backupPath = join(backupsDir, arquivo);
    if (!backupPath.startsWith(backupsDir) || !existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup não encontrado' });
    }
    return res.download(backupPath);
  }
  if (!existsSync(backupsDir)) {
    return res.json([]);
  }
  const backups = readdirSync(backupsDir)
    .filter(f => f.startsWith('barbearia-') && f.endsWith('.db'))
    .sort()
    .reverse();
  res.json(backups);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

