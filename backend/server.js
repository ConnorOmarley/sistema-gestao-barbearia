/*
 * Sistema de Gestão para Barbearia
 * Autor: Carlos Alberto
 * Contato: alberttcarlosu.u@gmail.com
 * Licença: MIT
 * Criado em: 2026
 */
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import db, { backupDatabase, backupsDir, getConfig, setConfig, transaction, closeDatabase, backupStatus, configureExternalBackup } from './database.js';
import { invalid, id, name, percent, money, roundMoney, flag, isPigmentacao, period, dayBounds } from './rules.js';
import { registerPhotoRoutes } from './photos.js';
import { registerFinance, guardAttendance, syncAttendance, removeAttendance, guardExpense, syncExpense, removeExpense, expenseDetails, commissionDetails, profit } from './finance.js';

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
app.use('/api', (req,res,next) => {
  if (/^\/(barbeiros|servicos)(\/|$)/.test(req.path) && req.method !== 'GET') return requerAcessoRelatorio(req,res,next);
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
function listAtendimentos(filters, extra = '', extraParams = [], page = null) {
  let sql = 'SELECT a.*,b.nome AS barbeiro_nome,b.is_dono AS barbeiro_is_dono,s.nome AS servico_nome FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id JOIN servicos s ON s.id=a.servico_id WHERE 1=1' + extra;
  const params = [...extraParams];
  if (filters.data_inicio) { sql += ' AND a.data_hora >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { sql += ' AND a.data_hora <= ?'; params.push(filters.data_fim); }
  const rows=getAll(sql+' ORDER BY a.data_hora DESC,a.id DESC'+(page?' LIMIT ? OFFSET ?':''),page?[...params,page.limit,page.offset]:params);
  if(!rows.length)return [];
  const items=[];
  for(let offset=0;offset<rows.length;offset+=400){
    const chunk=rows.slice(offset,offset+400);
    items.push(...getAll('SELECT i.*,s.nome AS servico_nome FROM atendimento_itens i JOIN servicos s ON s.id=i.servico_id WHERE i.atendimento_id IN ('+chunk.map(()=>'?').join(',')+') ORDER BY i.id',chunk.map(a=>a.id)));
  }
  const grouped=new Map();for(const item of items){if(!grouped.has(item.atendimento_id))grouped.set(item.atendimento_id,[]);grouped.get(item.atendimento_id).push(item);}
  return rows.map(a=>({...a,itens:grouped.get(a.id)||[]}));
}
const tokensRelatorio = new Set();
const pagamentos = new Set(['dinheiro', 'cartao', 'pix']);
function metodoPagamento(value) {
  if (typeof value !== 'string' || !pagamentos.has(value)) invalid('Escolha dinheiro, cartão ou Pix.');
  return value;
}
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

registerFinance(app, requerAcessoRelatorio);

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
    apenas_dono: flag(body.apenas_dono === undefined ? previous.apenas_dono : body.apenas_dono),
    comissao_fixa_pct: pigmentacao ? 0 : (raw === undefined || raw === null || raw === '' ? null : percent(raw))
  };
}
app.get('/api/servicos', (req, res) => res.json(getAll('SELECT * FROM servicos WHERE ativo=1 ORDER BY nome')));
app.post('/api/servicos', requerAcessoRelatorio, (req, res) => {
  const s = serviceFields(req.body);
  const value = transaction(() => insert('INSERT INTO servicos (nome,valor,apenas_dono,comissao_fixa_pct) VALUES (?,?,?,?)', [s.nome,s.valor,s.apenas_dono,s.comissao_fixa_pct]));
  res.json({ id:value,...s });
});
app.put('/api/servicos/:id', requerAcessoRelatorio, (req, res) => {
  const old = active('servicos', req.params.id);
  const s = serviceFields(req.body,old);
  change('UPDATE servicos SET nome=?,valor=?,apenas_dono=?,comissao_fixa_pct=? WHERE id=?',[s.nome,s.valor,s.apenas_dono,s.comissao_fixa_pct,old.id]);
  res.json({ id:old.id,...s });
});
app.delete('/api/servicos/:id', requerAcessoRelatorio, (req, res) => {
  change('UPDATE servicos SET ativo=0 WHERE id=? AND apenas_dono=0',[id(req.params.id)]);
  res.json({ success:true });
});

function prepararAtendimento(body, anterior = null) {
  const req = { body };
  const b = anterior ? getOne('SELECT * FROM barbeiros WHERE id=?',[anterior.barbeiro_id]) : active('barbeiros', body.barbeiro_id);
  if (!b) invalid('Profissional não encontrado.',404);
  let itens = req.body.itens;
  if (itens !== undefined && !Array.isArray(itens)) invalid('Itens devem ser uma lista.');
  if (!itens?.length) {
    if (!req.body.servico_id) invalid('Informe pelo menos um serviço.');
    // Legacy dye remains global: never copy it into the item as well.
    itens = [{ servico_id:req.body.servico_id,valor_cobrado:req.body.valor_cobrado }];
  }
  if (itens.length > 100) invalid('Máximo de 100 serviços por atendimento.');
  const observacao = req.body.observacao ?? '';
  const metodo_pagamento = metodoPagamento(req.body.metodo_pagamento || 'dinheiro');
  if (typeof observacao !== 'string' || observacao.length > 2000) invalid('Observação deve ter no máximo 2000 caracteres.');
  const tintaGlobal = money(req.body.valor_tinta === undefined ? 0 : req.body.valor_tinta,'Tinta');
  const pigGlobal = flag(req.body.tem_pigmentacao);
  const seen = new Set();
  const completos = itens.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Item inválido.');
    const servicoId = id(item.servico_id);
    if (seen.has(servicoId)) invalid('O mesmo serviço não pode ser adicionado duas vezes.');
    seen.add(servicoId);
    const s = anterior && getItensAtendimento(anterior.id).some(i=>i.servico_id===servicoId)
      ? getOne('SELECT * FROM servicos WHERE id=?',[servicoId]) : active('servicos',servicoId);
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
  return { b, completos, valor_cobrado, valor_tinta, valor_comissao, comissao_percentual, tem_pigmentacao, observacao, metodo_pagamento };
}
function salvarItens(atendimentoId, completos) {
  for (const i of completos) insert('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao) VALUES (?,?,?,?,?,?,?)',[atendimentoId,i.servico_id,i.valor_cobrado,i.valor_tinta,i.tem_pigmentacao,i.comissao_percentual,i.valor_comissao]);
}
app.post('/api/atendimentos', (req, res) => {
  const { b, completos, valor_cobrado, valor_tinta, valor_comissao, comissao_percentual, tem_pigmentacao, observacao, metodo_pagamento } = prepararAtendimento(req.body);
  const data_hora=new Date().toISOString();
  const value=transaction(()=>{
    const atendimentoId=insert('INSERT INTO atendimentos (barbeiro_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,observacao,metodo_pagamento) VALUES (?,?,?,?,?,?,?,?,?,?)',[b.id,completos[0].servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,observacao,metodo_pagamento]);
    salvarItens(atendimentoId, completos);
    syncAttendance(atendimentoId);
    return atendimentoId;
  });
  res.json({id:value,barbeiro_id:b.id,servico_id:completos[0].servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,metodo_pagamento,itens:completos});
});
app.put('/api/atendimentos/:id', requerAcessoRelatorio, (req,res)=>{
  const anterior=getOne('SELECT * FROM atendimentos WHERE id=?',[id(req.params.id)]);
  if(!anterior) invalid('Atendimento não encontrado.',404);
  guardAttendance(anterior.id);
  if(!Array.isArray(req.body.itens) || !req.body.itens.length) invalid('Informe pelo menos um serviço.');
  const prepared=prepararAtendimento({...req.body, metodo_pagamento:req.body.metodo_pagamento ?? anterior.metodo_pagamento, observacao:req.body.observacao ?? anterior.observacao},anterior);
  const { completos,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,observacao,metodo_pagamento }=prepared;
  const backup=basename(backupDatabase());
  transaction(()=>{
    db.run('UPDATE atendimentos SET servico_id=?,valor_cobrado=?,valor_tinta=?,tem_pigmentacao=?,comissao_percentual=?,valor_comissao=?,observacao=?,metodo_pagamento=? WHERE id=?',[completos[0].servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,observacao,metodo_pagamento,anterior.id]);
    db.run('DELETE FROM atendimento_itens WHERE atendimento_id=?',[anterior.id]);
    salvarItens(anterior.id,completos);
    syncAttendance(anterior.id);
  });
  res.json({success:true,backup,id:anterior.id});
});
const categoriasGastos=['tinta','giletes','produtos','material','aluguel','energia','manutenção','retirada do dono','outros'];
function camposGasto(body, old={}) {
  const categoria=name(body.categoria ?? old.categoria).toLowerCase();
  if(!categoriasGastos.includes(categoria)) invalid('Escolha uma categoria válida.');
  const descricao=name(body.descricao ?? old.descricao);
  const valor=money(body.valor ?? old.valor);
  if(valor<=0) invalid('O gasto deve ser maior que zero.');
  const metodo_pagamento=metodoPagamento(body.metodo_pagamento ?? old.metodo_pagamento);
  const data_hora=period({data_inicio:body.data_hora ?? old.data_hora}).data_inicio;
  if(!data_hora) invalid('Informe a data do gasto.');
  const observacao=body.observacao ?? old.observacao ?? '';
  if(typeof observacao!=='string' || observacao.length>2000) invalid('Observação deve ter no máximo 2000 caracteres.');
  return {categoria,descricao,valor,metodo_pagamento,data_hora,observacao};
}
function filtroSql(query, alias='') {
  const f=period(query), params=[]; let where='';
  if(f.data_inicio){where+=' AND '+alias+'data_hora>=?';params.push(f.data_inicio);}
  if(f.data_fim){where+=' AND '+alias+'data_hora<=?';params.push(f.data_fim);}
  return {where,params};
}
app.get('/api/gastos',requerAcessoRelatorio,(req,res)=>{
  let {where,params}=filtroSql(req.query);
  if(req.query.categoria){if(!categoriasGastos.includes(req.query.categoria)) invalid('Categoria inválida.');where+=' AND categoria=?';params.push(req.query.categoria);}
  if(req.query.pagina===undefined)return res.json(expenseDetails(getAll('SELECT * FROM gastos WHERE 1=1'+where+' ORDER BY data_hora DESC,id DESC',params)));
  const page=Number(req.query.pagina);if(!Number.isSafeInteger(page)||page<1)invalid('Página inválida.');
  const summary=getOne('SELECT COUNT(*) total,COALESCE(SUM(valor),0) valor FROM gastos WHERE 1=1'+where,params),pages=Math.max(1,Math.ceil(summary.total/50)),current=Math.min(page,pages);
  res.json({itens:expenseDetails(getAll('SELECT * FROM gastos WHERE 1=1'+where+' ORDER BY data_hora DESC,id DESC LIMIT 50 OFFSET ?',[...params,(current-1)*50])),pagina:current,paginas:pages,total:summary.total,valor:roundMoney(summary.valor)});
});
app.post('/api/gastos',requerAcessoRelatorio,(req,res)=>{
  const g=camposGasto(req.body);
  const value=transaction(()=>{const value=insert('INSERT INTO gastos (categoria,descricao,valor,metodo_pagamento,data_hora,observacao) VALUES (?,?,?,?,?,?)',Object.values(g));syncExpense(value,req.body);return value;});
  res.json({id:value,...g});
});
app.put('/api/gastos/:id',requerAcessoRelatorio,(req,res)=>{
  const old=getOne('SELECT * FROM gastos WHERE id=?',[id(req.params.id)]);
  if(!old) invalid('Gasto não encontrado.',404);
  guardExpense(old.id);
  const g=camposGasto(req.body,old);
  transaction(()=>{db.run('UPDATE gastos SET categoria=?,descricao=?,valor=?,metodo_pagamento=?,data_hora=?,observacao=? WHERE id=?',[...Object.values(g),old.id]);syncExpense(old.id,req.body,old);});
  res.json({id:old.id,...g});
});
app.delete('/api/gastos/:id',requerAcessoRelatorio,(req,res)=>{
  const value=id(req.params.id);
  if(!getOne('SELECT id FROM gastos WHERE id=?',[value])) invalid('Gasto não encontrado.',404);
  const backup=basename(backupDatabase());
  transaction(()=>{removeExpense(value);db.run('DELETE FROM gastos WHERE id=?',[value]);});res.json({success:true,backup});
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
  transaction(()=>{for(const a of getAll('SELECT id FROM atendimentos'))removeAttendance(a.id);db.run('DELETE FROM atendimentos');});
  res.json({success:true,backup,message:'Todos os atendimentos foram limpos. A senha foi preservada.'});
});
app.delete('/api/atendimentos/:id',requerAcessoRelatorio,(req,res)=>{
  const value=id(req.params.id);
  const a=getOne('SELECT * FROM atendimentos WHERE id=?',[value]);
  if (!a) invalid('Atendimento não encontrado.',404);
  backupDatabase();
  transaction(()=>{removeAttendance(value);db.run('DELETE FROM atendimentos WHERE id=?',[value]);});
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
  res.json(commissionDetails(getAll(sql,params),req.query));
});
app.get('/api/relatorio/geral',requerAcessoRelatorio,(req,res)=>{
  const f=period(req.query);let where='';const params=[];
  if(f.data_inicio){where+=' AND a.data_hora>=?';params.push(f.data_inicio);}
  if(f.data_fim){where+=' AND a.data_hora<=?';params.push(f.data_fim);}
  const geral=getOne('SELECT ROUND(COALESCE(SUM(a.valor_cobrado),0),2) AS total_geral,ROUND(COALESCE(SUM(a.valor_tinta),0),2) AS total_tinta,ROUND(COALESCE(SUM(CASE WHEN b.is_dono=0 THEN a.valor_comissao ELSE 0 END),0),2) AS total_colaboradores,ROUND(COALESCE(SUM(CASE WHEN b.is_dono=1 THEN a.valor_comissao ELSE 0 END),0),2) AS total_comissao_dono,ROUND(COALESCE(SUM(a.valor_cobrado+a.valor_tinta-a.valor_comissao),0),2) AS total_barbearia,COUNT(a.id) AS total_atendimentos FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id WHERE 1=1'+where,params);
  const gf=filtroSql(req.query);
  const total_gastos=getOne('SELECT ROUND(COALESCE(SUM(valor),0),2) total FROM gastos WHERE 1=1'+gf.where,gf.params).total;
  const gastos_por_categoria=getAll('SELECT categoria,ROUND(SUM(valor),2) total FROM gastos WHERE 1=1'+gf.where+' GROUP BY categoria ORDER BY categoria',gf.params);
  const pagamentos=getAll('SELECT metodo_pagamento,ROUND(SUM(valor_cobrado+valor_tinta),2) total FROM atendimentos WHERE 1=1'+gf.where+' GROUP BY metodo_pagamento',gf.params);
  const total_recebido=roundMoney(geral.total_geral+geral.total_tinta);
  res.json({...geral,...profit(req.query),total_recebido,total_gastos,saldo_operacional:roundMoney(total_recebido-total_gastos),gastos_por_categoria,pagamentos});
});
app.get('/api/relatorio/atendimentos',requerAcessoRelatorio,(req,res)=>{
  if(req.query.pagina===undefined)return res.json(listAtendimentos(period(req.query)));
  const page=Number(req.query.pagina);if(!Number.isSafeInteger(page)||page<1)invalid('Página inválida.');
  const f=filtroSql(req.query),summary=getOne('SELECT COUNT(*) total,COALESCE(SUM(valor_cobrado+valor_tinta),0) valor FROM atendimentos WHERE 1=1'+f.where,f.params);
  const pages=Math.max(1,Math.ceil(summary.total/50)),current=Math.min(page,pages);
  res.json({itens:listAtendimentos(period(req.query),'',[],{limit:50,offset:(current-1)*50}),pagina:current,paginas:pages,total:summary.total,valor:roundMoney(summary.valor)});
});
app.get('/api/backup/status',requerAcessoRelatorio,(req,res)=>res.json(backupStatus()));
app.put('/api/backup/configuracao',requerAcessoRelatorio,(req,res)=>res.json(configureExternalBackup(req.body.pasta)));
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
