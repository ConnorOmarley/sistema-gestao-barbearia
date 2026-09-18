import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import db, { backupDatabase, backupsDir, getConfig, setConfig, transaction, closeDatabase } from './database.js';
import { invalid, id, name, percent, money, roundMoney, flag, isPigmentacao, period, dayBounds } from './rules.js';
import { registerPhotoRoutes } from './photos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use((req, res, next) => {
  // The portable UI and API share an origin. Other websites must not operate the cash register.
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site' ||
      (origin && !['http://localhost:' + PORT, 'http://127.0.0.1:' + PORT].includes(origin))) {
    return res.status(403).json({ error: 'Origem não autorizada.' });
  }
  if (!['localhost:' + PORT, '127.0.0.1:' + PORT].includes(req.headers.host)) return res.status(403).json({ error: 'Endereço não autorizado.' });
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (['POST', 'PUT'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'Envie um objeto JSON.' });
  next();
});
app.use(express.static(join(__dirname, '../frontend')));
const perfilDir = join(__dirname, '../frontend/assets/perfil');
mkdirSync(perfilDir, { recursive: true });

function getAll(query, params = []) {
  const result = db.exec(query, params);
  if (!result.length) return [];
  return result[0].values.map(row => Object.fromEntries(result[0].columns.map((col, i) => [col, row[i]])));
}
function getOne(query, params = []) { return getAll(query, params)[0] || null; }
function change(query, params = []) { return transaction(() => db.run(query, params)); }
function insert(query, params = []) {
  db.run(query, params);
  return getOne('SELECT last_insert_rowid() AS id').id;
}
function active(table, value) {
  const record = getOne('SELECT * FROM ' + table + ' WHERE id = ? AND ativo = 1', [id(value)]);
  if (!record) invalid('Cadastro não encontrado ou inativo.', 404);
  return record;
}
function getItensAtendimento(value) {
  return getAll('SELECT i.*, s.nome AS servico_nome FROM atendimento_itens i JOIN servicos s ON s.id=i.servico_id WHERE i.atendimento_id=? ORDER BY i.id', [value]);
}
function listAtendimentos(filters, extra = '', extraParams = []) {
  let sql = 'SELECT a.*,b.nome AS barbeiro_nome,b.is_dono AS barbeiro_is_dono,s.nome AS servico_nome FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id JOIN servicos s ON s.id=a.servico_id WHERE 1=1' + extra;
  const params = [...extraParams];
  if (filters.data_inicio) { sql += ' AND a.data_hora >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { sql += ' AND a.data_hora <= ?'; params.push(filters.data_fim); }
  return getAll(sql + ' ORDER BY a.data_hora DESC,a.id DESC', params).map(a => ({ ...a, itens: getItensAtendimento(a.id) }));
}
const tokensRelatorio = new Set();
function token(req) { return req.headers['x-relatorio-token']; }
function isOwner(req) { return typeof token(req) === 'string' && tokensRelatorio.has(token(req)); }
function requerAcessoRelatorio(req, res, next) {
  if (!isOwner(req)) return res.status(401).json({ error: 'Acesso negado. Informe a senha do dono.' });
  next();
}
function criarTokenRelatorio() {
  const value = randomBytes(32).toString('hex');
  tokensRelatorio.add(value);
  return value;
}

app.get('/api/barbeiros', (req, res) => res.json(getAll('SELECT * FROM barbeiros WHERE ativo=1 ORDER BY is_dono DESC,id')));
app.post('/api/barbeiros', (req, res) => {
  const nome = name(req.body.nome);
  const comissao_percentual = percent(req.body.comissao_percentual);
  if (flag(req.body.is_dono)) invalid('O dono já está cadastrado. Cadastre um colaborador.');
  const value = transaction(() => insert('INSERT INTO barbeiros (nome,comissao_percentual,is_dono) VALUES (?,?,0)', [nome,comissao_percentual]));
  res.json({ id: value, nome, comissao_percentual, is_dono: 0 });
});
app.put('/api/barbeiros/:id', (req, res) => {
  const b = active('barbeiros', req.params.id);
  const nome = name(req.body.nome === undefined ? b.nome : req.body.nome);
  const supplied = req.body.comissao_percentual === undefined ? b.comissao_percentual : percent(req.body.comissao_percentual);
  const comissao_percentual = b.is_dono ? 100 : supplied;
  change('UPDATE barbeiros SET nome=?,comissao_percentual=? WHERE id=?',[nome,comissao_percentual,b.id]);
  res.json({ id:b.id,nome,comissao_percentual });
});
app.delete('/api/barbeiros/:id', (req, res) => {
  change('UPDATE barbeiros SET ativo=0 WHERE id=? AND is_dono=0',[id(req.params.id)]);
  res.json({ success:true });
});
registerPhotoRoutes(app, getOne, change, perfilDir);

function serviceFields(body, previous = {}) {
  const nome = name(body.nome === undefined ? previous.nome : body.nome);
  const valor = money(body.valor === undefined ? previous.valor : body.valor);
  const pigmentacao = isPigmentacao(nome);
  const raw = body.comissao_fixa_pct === undefined ? previous.comissao_fixa_pct : body.comissao_fixa_pct;
  return {
    nome, valor,
    apenas_dono: pigmentacao ? 1 : flag(body.apenas_dono === undefined ? previous.apenas_dono : body.apenas_dono),
    comissao_fixa_pct: pigmentacao ? 0 : (raw === undefined || raw === null || raw === '' ? null : percent(raw))
  };
}
app.get('/api/servicos', (req, res) => res.json(getAll('SELECT * FROM servicos WHERE ativo=1 ORDER BY nome')));
app.post('/api/servicos', (req, res) => {
  const s = serviceFields(req.body);
  const value = transaction(() => insert('INSERT INTO servicos (nome,valor,apenas_dono,comissao_fixa_pct) VALUES (?,?,?,?)', [s.nome,s.valor,s.apenas_dono,s.comissao_fixa_pct]));
  res.json({ id:value,...s });
});
app.put('/api/servicos/:id', (req, res) => {
  const old = active('servicos', req.params.id);
  const s = serviceFields(req.body,old);
  change('UPDATE servicos SET nome=?,valor=?,apenas_dono=?,comissao_fixa_pct=? WHERE id=?',[s.nome,s.valor,s.apenas_dono,s.comissao_fixa_pct,old.id]);
  res.json({ id:old.id,...s });
});
app.delete('/api/servicos/:id', (req, res) => {
  change('UPDATE servicos SET ativo=0 WHERE id=? AND apenas_dono=0',[id(req.params.id)]);
  res.json({ success:true });
});

app.post('/api/atendimentos', (req, res) => {
  const b = active('barbeiros', req.body.barbeiro_id);
  let itens = req.body.itens;
  if (itens !== undefined && !Array.isArray(itens)) invalid('Itens devem ser uma lista.');
  if (!itens?.length) {
    if (!req.body.servico_id) invalid('Informe pelo menos um serviço.');
    // Legacy dye remains global: never copy it into the item as well.
    itens = [{ servico_id:req.body.servico_id,valor_cobrado:req.body.valor_cobrado }];
  }
  if (itens.length > 100) invalid('Máximo de 100 serviços por atendimento.');
  const observacao = req.body.observacao ?? '';
  if (typeof observacao !== 'string' || observacao.length > 2000) invalid('Observação deve ter no máximo 2000 caracteres.');
  const tintaGlobal = money(req.body.valor_tinta === undefined ? 0 : req.body.valor_tinta,'Tinta');
  const pigGlobal = flag(req.body.tem_pigmentacao);
  const seen = new Set();
  const completos = itens.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Item inválido.');
    const servicoId = id(item.servico_id);
    if (seen.has(servicoId)) invalid('O mesmo serviço não pode ser adicionado duas vezes.');
    seen.add(servicoId);
    const s = active('servicos',servicoId);
    if (s.apenas_dono && !b.is_dono) invalid('O serviço "' + s.nome + '" só pode ser feito pelo dono.');
    const valor_cobrado = money(item.valor_cobrado,'Valor cobrado');
    const valor_tinta = roundMoney(money(item.valor_tinta === undefined ? 0 : item.valor_tinta,'Tinta') + (index === 0 ? tintaGlobal : 0));
    const tem_pigmentacao = (flag(item.tem_pigmentacao) || valor_tinta > 0 || (index === 0 && pigGlobal)) ? 1 : 0;
    const comissao_percentual = b.is_dono ? 100 : percent(s.comissao_fixa_pct ?? b.comissao_percentual);
    const valor_comissao = b.is_dono ? roundMoney(valor_cobrado + valor_tinta) : roundMoney(valor_cobrado * comissao_percentual / 100);
    return { servico_id:servicoId,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao };
  });
  const sum = key => completos.reduce((total,i) => total + Math.round(i[key]*100),0)/100;
  const valor_cobrado=sum('valor_cobrado'),valor_tinta=sum('valor_tinta'),valor_comissao=sum('valor_comissao');
  const base=valor_cobrado+valor_tinta;
  const comissao_percentual=base>0 ? valor_comissao/base*100 : 0;
  const tem_pigmentacao=completos.some(i=>i.tem_pigmentacao)?1:0;
  const data_hora=new Date().toISOString();
  const value=transaction(()=>{
    const atendimentoId=insert('INSERT INTO atendimentos (barbeiro_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,observacao) VALUES (?,?,?,?,?,?,?,?,?)',[b.id,completos[0].servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,observacao]);
    for (const i of completos) insert('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao) VALUES (?,?,?,?,?,?,?)',[atendimentoId,i.servico_id,i.valor_cobrado,i.valor_tinta,i.tem_pigmentacao,i.comissao_percentual,i.valor_comissao]);
    return atendimentoId;
  });
  res.json({id:value,barbeiro_id:b.id,servico_id:completos[0].servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,itens:completos});
});
app.get('/api/atendimentos', (req, res) => {
  const filtros=period(req.query);
  if (isOwner(req)) return res.json(listAtendimentos(filtros));
  const hoje=dayBounds();
  const rows=listAtendimentos(filtros,' AND a.data_hora >= ? AND a.data_hora < ?',[hoje.inicio,hoje.fim]);
  // Public cash-register history contains today's receipts, never commission reports.
  res.json(rows.map(a=>{
    const {comissao_percentual,valor_comissao,...publico}=a;
    publico.itens=a.itens.map(({comissao_percentual,valor_comissao,...item})=>item);
    return publico;
  }));
});
app.delete('/api/atendimentos', requerAcessoRelatorio, (req,res)=>{
  if (req.body?.confirmacao !== 'APAGAR TODOS') invalid('Confirme a limpeza com APAGAR TODOS.');
  const backup=basename(backupDatabase());
  change('DELETE FROM atendimentos');
  res.json({success:true,backup,message:'Todos os atendimentos foram limpos. A senha foi preservada.'});
});
app.delete('/api/atendimentos/:id',(req,res)=>{
  const value=id(req.params.id);
  const a=getOne('SELECT * FROM atendimentos WHERE id=?',[value]);
  if (!a) invalid('Atendimento não encontrado.',404);
  const hoje=dayBounds();
  if (!isOwner(req) && !(a.data_hora>=hoje.inicio && a.data_hora<hoje.fim)) invalid('Entre na Área do Dono para excluir atendimentos de dias anteriores.',401);
  change('DELETE FROM atendimentos WHERE id=?',[value]);
  res.json({success:true});
});

function hashSenha(senha,salt) { return createHash('sha256').update(salt+'::'+senha).digest('hex'); }
function senhaValida(senha) {
  if (typeof senha !== 'string') return false;
  const raw=getConfig('senha_dono');
  if (!raw) return false;
  const [salt,hash]=raw.split(':');
  try { return timingSafeEqual(Buffer.from(hashSenha(senha,salt),'hex'),Buffer.from(hash,'hex')); }
  catch { return false; }
}
app.post('/api/relatorio/configurar-senha',(req,res)=>{
  const {senha}=req.body;
  if (typeof senha !== 'string' || senha.length<4 || senha.length>256) invalid('A senha deve ter entre 4 e 256 caracteres.');
  if (getConfig('senha_dono')) invalid('Senha já configurada.');
  const salt=randomBytes(16).toString('hex');
  setConfig('senha_dono',salt+':'+hashSenha(senha,salt));
  res.json({success:true,token:criarTokenRelatorio()});
});
app.post('/api/relatorio/login',(req,res)=>{
  if (!getConfig('senha_dono')) invalid('Senha ainda não configurada.');
  if (!senhaValida(req.body.senha)) invalid('Senha incorreta.',401);
  res.json({success:true,token:criarTokenRelatorio()});
});
app.post('/api/relatorio/logout',(req,res)=>{
  tokensRelatorio.delete(token(req));
  res.json({success:true});
});
app.get('/api/relatorio/status',(req,res)=>res.json({senhaConfigurada:!!getConfig('senha_dono')}));
app.get('/api/relatorio/comissoes',requerAcessoRelatorio,(req,res)=>{
  const f=period(req.query);let condition='';const params=[];
  if(f.data_inicio){condition+=' AND a.data_hora>=?';params.push(f.data_inicio);}
  if(f.data_fim){condition+=' AND a.data_hora<=?';params.push(f.data_fim);}
  const sql='SELECT b.id,b.nome,b.is_dono,b.ativo,b.foto,COUNT(a.id) AS total_atendimentos,ROUND(COALESCE(SUM(a.valor_cobrado),0),2) AS total_faturado,ROUND(COALESCE(SUM(a.valor_tinta),0),2) AS total_tinta,ROUND(COALESCE(SUM(a.valor_comissao),0),2) AS total_comissao_colaborador,ROUND(COALESCE(SUM(a.valor_cobrado+a.valor_tinta-a.valor_comissao),0),2) AS total_barbearia FROM barbeiros b LEFT JOIN atendimentos a ON b.id=a.barbeiro_id'+condition+' WHERE b.ativo=1 OR a.id IS NOT NULL GROUP BY b.id ORDER BY b.is_dono DESC,b.id';
  res.json(getAll(sql,params));
});
app.get('/api/relatorio/geral',requerAcessoRelatorio,(req,res)=>{
  const f=period(req.query);let where='';const params=[];
  if(f.data_inicio){where+=' AND a.data_hora>=?';params.push(f.data_inicio);}
  if(f.data_fim){where+=' AND a.data_hora<=?';params.push(f.data_fim);}
  res.json(getOne('SELECT ROUND(COALESCE(SUM(a.valor_cobrado),0),2) AS total_geral,ROUND(COALESCE(SUM(a.valor_tinta),0),2) AS total_tinta,ROUND(COALESCE(SUM(CASE WHEN b.is_dono=0 THEN a.valor_comissao ELSE 0 END),0),2) AS total_colaboradores,ROUND(COALESCE(SUM(CASE WHEN b.is_dono=1 THEN a.valor_comissao ELSE 0 END),0),2) AS total_comissao_dono,ROUND(COALESCE(SUM(a.valor_cobrado+a.valor_tinta-a.valor_comissao),0),2) AS total_barbearia,COUNT(a.id) AS total_atendimentos FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id WHERE 1=1'+where,params));
});
app.get('/api/relatorio/atendimentos',requerAcessoRelatorio,(req,res)=>res.json(listAtendimentos(period(req.query))));
app.post('/api/backup',requerAcessoRelatorio,(req,res)=>res.json({success:true,arquivo:basename(backupDatabase())}));
app.get('/api/backup',requerAcessoRelatorio,(req,res)=>{
  const {arquivo}=req.query;
  if (arquivo !== undefined) {
    if (typeof arquivo !== 'string' || !/^barbearia-[\w.-]+\.db$/.test(arquivo) || basename(arquivo)!==arquivo) invalid('Backup não encontrado.',404);
    const path=join(backupsDir,arquivo);
    if (!existsSync(path)) invalid('Backup não encontrado.',404);
    return res.download(path);
  }
  res.json(existsSync(backupsDir)?readdirSync(backupsDir).filter(f=>/^barbearia-[\w.-]+\.db$/.test(f)).sort().reverse():[]);
});
app.use((error,req,res,next)=>{
  if (res.headersSent) return next(error);
  const status=error.status || 500;
  if(status>=500)console.error(error);
  res.status(status).json({error:status>=500?'Não foi possível salvar a operação. Confira o disco e tente novamente.':error.message});
});
const server=app.listen(PORT,'127.0.0.1',()=>{
  console.log('Servidor rodando em http://localhost:'+PORT);
  if(process.send)process.send('ready');
});
function shutdown() {
  try { closeDatabase(); }
  catch(error){console.error('Falha ao encerrar:',error.message);process.exitCode=1;}
  server.close(()=>process.exit(process.exitCode || 0));
}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
process.on('message',message=>{if(message==='shutdown')shutdown();});
process.on('disconnect',shutdown);
server.on('error',error=>{console.error('Não foi possível iniciar:',error.message);closeDatabase();process.exit(1);});
