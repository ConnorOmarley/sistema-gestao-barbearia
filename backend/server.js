import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import db, { saveDatabase, backupDatabase, backupsDir, getConfig, setConfig } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '../frontend')));

const perfilDir = join(__dirname, '../frontend/assets/perfil');
if (!existsSync(perfilDir)) {
  mkdirSync(perfilDir, { recursive: true });
}

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
  const barbeiros = getAll('SELECT * FROM barbeiros WHERE ativo = 1 ORDER BY is_dono DESC, id');
  res.json(barbeiros);
});

app.post('/api/barbeiros', (req, res) => {
  const nome = (req.body.nome || '').trim();
  const comissao_percentual = parseFloat(req.body.comissao_percentual) || 0;
  const is_dono = req.body.is_dono ? 1 : 0;
  const id = run('INSERT INTO barbeiros (nome, comissao_percentual, is_dono) VALUES (?, ?, ?)', [nome, comissao_percentual, is_dono]);
  res.json({ id, nome, comissao_percentual, is_dono });
});

app.put('/api/barbeiros/:id', (req, res) => {
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ?', [req.params.id]);
  const nome = (req.body.nome || barbeiro.nome || '').trim();
  const comissao_percentual = parseFloat(req.body.comissao_percentual) || barbeiro.comissao_percentual || 0;
  db.run('UPDATE barbeiros SET nome = ?, comissao_percentual = ? WHERE id = ?', [nome, comissao_percentual, req.params.id]);
  saveDatabase();
  res.json({ id: req.params.id, nome, comissao_percentual });
});

app.delete('/api/barbeiros/:id', (req, res) => {
  db.run('UPDATE barbeiros SET ativo = 0 WHERE id = ? AND is_dono = 0', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.post('/api/barbeiros/:id/foto', (req, res) => {
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ? AND ativo = 1', [req.params.id]);
  if (!barbeiro) {
    return res.status(404).json({ error: 'Barbeiro não encontrado' });
  }

  const { foto } = req.body;
  if (!foto || typeof foto !== 'string') {
    return res.status(400).json({ error: 'Imagem não enviada.' });
  }

  const match = foto.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.' });
  }

  const ext = match[1] === 'jpg' ? 'jpg' : match[1];
  const dados = Buffer.from(match[2], 'base64');
  if (dados.length > 1024 * 1024) {
    return res.status(400).json({ error: 'A imagem é muito grande. Máximo 1MB.' });
  }

  const nomeArquivo = `barbeiro_${barbeiro.id}.${ext}`;
  const caminho = join(perfilDir, nomeArquivo);
  writeFileSync(caminho, dados);

  if (barbeiro.foto) {
    const antiga = join(perfilDir, basename(barbeiro.foto));
    if (existsSync(antiga) && antiga !== caminho) {
      try { unlinkSync(antiga); } catch (e) {}
    }
  }

  db.run('UPDATE barbeiros SET foto = ? WHERE id = ?', [`assets/perfil/${nomeArquivo}`, barbeiro.id]);
  saveDatabase();
  res.json({ foto: `assets/perfil/${nomeArquivo}` });
});

app.delete('/api/barbeiros/:id/foto', (req, res) => {
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ? AND ativo = 1', [req.params.id]);
  if (!barbeiro) {
    return res.status(404).json({ error: 'Barbeiro não encontrado' });
  }

  if (barbeiro.foto) {
    const arquivo = join(perfilDir, basename(barbeiro.foto));
    if (existsSync(arquivo)) {
      try { unlinkSync(arquivo); } catch (e) {}
    }
  }

  db.run('UPDATE barbeiros SET foto = NULL WHERE id = ?', [barbeiro.id]);
  saveDatabase();
  res.json({ foto: null });
});

app.get('/api/servicos', (req, res) => {
  const servicos = getAll('SELECT * FROM servicos WHERE ativo = 1 ORDER BY nome');
  res.json(servicos);
});

app.post('/api/servicos', (req, res) => {
  const nome = (req.body.nome || '').trim();
  const valor = parseFloat(req.body.valor) || 0;
  const apenas_dono = req.body.apenas_dono ? 1 : 0;
  const id = run('INSERT INTO servicos (nome, valor, apenas_dono) VALUES (?, ?, ?)', [nome, valor, apenas_dono]);
  res.json({ id, nome, valor, apenas_dono });
});

app.put('/api/servicos/:id', (req, res) => {
  const servico = getOne('SELECT * FROM servicos WHERE id = ?', [req.params.id]);
  const nome = (req.body.nome || servico.nome || '').trim();
  const valor = parseFloat(req.body.valor) || servico.valor || 0;
  const apenas_dono = req.body.apenas_dono !== undefined ? (req.body.apenas_dono ? 1 : 0) : servico.apenas_dono;
  db.run('UPDATE servicos SET nome = ?, valor = ?, apenas_dono = ? WHERE id = ?', [nome, valor, apenas_dono, req.params.id]);
  saveDatabase();
  res.json({ id: req.params.id, nome, valor, apenas_dono });
});

app.delete('/api/servicos/:id', (req, res) => {
  db.run('UPDATE servicos SET ativo = 0 WHERE id = ? AND apenas_dono = 0', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.post('/api/atendimentos', (req, res) => {
  const { barbeiro_id, servico_id, valor_cobrado, observacao, valor_tinta, tem_pigmentacao } = req.body;
  
  const barbeiro = getOne('SELECT * FROM barbeiros WHERE id = ?', [barbeiro_id]);
  const servico = getOne('SELECT * FROM servicos WHERE id = ?', [servico_id]);
  
  if (!barbeiro || !servico) {
    return res.status(400).json({ error: 'Barbeiro ou serviço não encontrado' });
  }
  
  if (servico.apenas_dono && !barbeiro.is_dono) {
    return res.status(400).json({ error: 'Este serviço só pode ser feito pelo dono' });
  }
  
  const comissao_percentual = barbeiro.comissao_percentual;
  let valor_comissao = (valor_cobrado * comissao_percentual) / 100;
  const data_hora = new Date().toISOString();
  const tinta = valor_tinta ? parseFloat(valor_tinta) : 0;
  const pigmentacao = (tem_pigmentacao || tinta > 0) ? 1 : 0;
  // Regra: comissao so existe para colaboradores. O dono recebe
  // 100% de tudo que ele mesmo atende (servico + tinta), pois a
  // barbearia e dele.
  if (barbeiro.is_dono) {
    valor_comissao = valor_cobrado + tinta;
  }
  
  const id = run(`
    INSERT INTO atendimentos (barbeiro_id, servico_id, valor_cobrado, valor_tinta, tem_pigmentacao, comissao_percentual, valor_comissao, data_hora, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [barbeiro_id, servico_id, valor_cobrado, tinta, pigmentacao, comissao_percentual, valor_comissao, data_hora, observacao || '']);
  
  res.json({
    id,
    barbeiro_id,
    servico_id,
    valor_cobrado,
    valor_tinta: tinta,
    tem_pigmentacao: pigmentacao,
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

app.delete('/api/atendimentos', (req, res) => {
  db.run('DELETE FROM atendimentos');
  try {
    db.run("DELETE FROM sqlite_sequence WHERE name = 'atendimentos'");
  } catch (e) {}
  saveDatabase();
  res.json({ success: true, message: 'Todos os atendimentos foram limpos' });
});

app.delete('/api/atendimentos/:id', (req, res) => {
  db.run('DELETE FROM atendimentos WHERE id = ?', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

function hashSenha(senha, salt) {
  return createHash('sha256').update(`${salt}::${senha}`).digest('hex');
}

function gerarSalt() {
  return randomBytes(16).toString('hex');
}

function getSenhaDono() {
  const raw = getConfig('senha_dono');
  if (!raw) return null;
  const [salt, hash] = raw.split(':');
  return { salt, hash };
}

function senhaValida(senha) {
  const armazenada = getSenhaDono();
  if (!armazenada) return true;
  const hash = hashSenha(senha, armazenada.salt);
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(armazenada.hash, 'hex'));
  } catch {
    return false;
  }
}

const tokensRelatorio = new Set();

function criarTokenRelatorio() {
  const token = randomBytes(32).toString('hex');
  tokensRelatorio.add(token);
  return token;
}

function validarTokenRelatorio(token) {
  return token && tokensRelatorio.has(token);
}

function requerAcessoRelatorio(req, res, next) {
  const token = req.headers['x-relatorio-token'] || req.query.token;
  if (validarTokenRelatorio(token)) return next();
  return res.status(401).json({ error: 'Acesso negado. Informe a senha do dono.' });
}

app.post('/api/relatorio/configurar-senha', (req, res) => {
  const { senha } = req.body;
  if (!senha || String(senha).length < 4) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres' });
  }
  if (getConfig('senha_dono')) {
    return res.status(400).json({ error: 'Senha já configurada' });
  }
  const salt = gerarSalt();
  setConfig('senha_dono', `${salt}:${hashSenha(senha, salt)}`);
  res.json({ success: true, token: criarTokenRelatorio() });
});

app.post('/api/relatorio/login', (req, res) => {
  const { senha } = req.body;
  if (!getConfig('senha_dono')) {
    return res.status(400).json({ error: 'Senha ainda não configurada' });
  }
  if (senhaValida(senha)) {
    res.json({ success: true, token: criarTokenRelatorio() });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

app.get('/api/relatorio/status', (req, res) => {
  res.json({ senhaConfigurada: !!getConfig('senha_dono') });
});

app.get('/api/relatorio/comissoes', requerAcessoRelatorio, (req, res) => {
  const { data_inicio, data_fim, periodo } = req.query;
  
  let joinConditions = '';
  const params = [];
  
  if (data_inicio) {
    joinConditions += ' AND a.data_hora >= ?';
    params.push(data_inicio);
  }
  
  if (data_fim) {
    joinConditions += ' AND a.data_hora <= ?';
    params.push(data_fim);
  }
  
  const query = `
    SELECT 
      b.id,
      b.nome,
      b.is_dono,
      b.foto,
      COUNT(a.id) as total_atendimentos,
      COALESCE(SUM(a.valor_cobrado), 0) as total_faturado,
      COALESCE(SUM(a.valor_tinta), 0) as total_tinta,
      COALESCE(SUM(a.valor_comissao), 0) as total_comissao_colaborador,
      COALESCE(SUM((a.valor_cobrado + a.valor_tinta) - a.valor_comissao), 0) as total_barbearia
    FROM barbeiros b
    LEFT JOIN atendimentos a ON b.id = a.barbeiro_id ${joinConditions}
    WHERE b.ativo = 1
    GROUP BY b.id, b.nome, b.is_dono, b.foto
    ORDER BY b.is_dono DESC, b.id
  `;
  
  const relatorio = getAll(query, params);
  res.json(relatorio);
});

app.get('/api/relatorio/geral', requerAcessoRelatorio, (req, res) => {
  const { data_inicio, data_fim } = req.query;
  
  let query = `
    SELECT 
      COALESCE(SUM(valor_cobrado), 0) as total_geral,
      COALESCE(SUM(valor_tinta), 0) as total_tinta,
      COALESCE(SUM(valor_comissao), 0) as total_colaboradores,
      COALESCE(SUM((valor_cobrado + valor_tinta) - valor_comissao), 0) as total_barbearia,
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

