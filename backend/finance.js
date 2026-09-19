import db, { transaction, backupDatabase, getConfig } from './database.js';
import { invalid, id, name, money, period } from './rules.js';
import { randomUUID, createHash } from 'node:crypto';

const all = (sql, args=[]) => { const r=db.exec(sql,args)[0]; return r ? r.values.map(v=>Object.fromEntries(r.columns.map((k,i)=>[k,v[i]]))) : []; };
const one = (sql,args=[]) => all(sql,args)[0] || null;
const cents = value => Math.round(money(value)*100);
const brl = value => Number(value || 0)/100;
const now = () => new Date().toISOString();
const total = (sql,args=[]) => Number(one(sql,args)?.total || 0);
function date(value, future=false) {
  const result=period({data_inicio:value}).data_inicio;
  if(!result) invalid('Informe a data.');
  if(!future && result>now()) invalid('A data do movimento não pode estar no futuro.');
  return result;
}
function day(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Informe uma data válida.');
  date(value+'T00:00:00.000Z',true); return value;
}
function filter(query, field) {
  const p=period(query), args=[]; let sql='';
  if(p.data_inicio){sql+=' AND '+field+'>=?';args.push(p.data_inicio);}
  if(p.data_fim){sql+=' AND '+field+'<=?';args.push(p.data_fim);}
  return {sql,args};
}
function movement({tipo,referencia=null,valor,data_hora,descricao,automatico=0,operacao=randomUUID()}) {
  db.run('INSERT INTO fin_movimentos (operacao,tipo,referencia,valor_centavos,data_hora,descricao,automatico) VALUES (?,?,?,?,?,?,?)',[operacao,tipo,referencia,valor,data_hora,descricao,automatico]);
  return one('SELECT last_insert_rowid() id').id;
}
function cancelSource(tipo,referencia,motivo) {
  db.run('UPDATE fin_movimentos SET estornado_em=?,motivo=? WHERE tipo=? AND referencia=? AND estornado_em IS NULL',[now(),motivo,tipo,referencia]);
}
function migrate() {
  if(getConfig('financeiro_schema')==='1') return;
  backupDatabase();
  transaction(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS fin_movimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, operacao TEXT NOT NULL, tipo TEXT NOT NULL,
      referencia INTEGER, valor_centavos INTEGER NOT NULL, data_hora TEXT NOT NULL,
      descricao TEXT NOT NULL, automatico INTEGER NOT NULL DEFAULT 0,
      estornado_em TEXT, motivo TEXT, criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX IF NOT EXISTS fin_movimentos_data ON fin_movimentos(data_hora);
      CREATE INDEX IF NOT EXISTS fin_movimentos_ref ON fin_movimentos(tipo,referencia);
      CREATE TABLE IF NOT EXISTS fin_comissao_itens (
      movimento_id INTEGER NOT NULL REFERENCES fin_movimentos(id),
      atendimento_id INTEGER REFERENCES atendimentos(id) ON DELETE SET NULL,
      valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0));
      CREATE INDEX IF NOT EXISTS fin_comissao_atendimento ON fin_comissao_itens(atendimento_id);
      CREATE TABLE IF NOT EXISTS fin_cartoes (
      atendimento_id INTEGER PRIMARY KEY REFERENCES atendimentos(id) ON DELETE CASCADE,
      taxa_centavos INTEGER NOT NULL DEFAULT 0 CHECK(taxa_centavos>=0), previsto_em TEXT);
      CREATE TABLE IF NOT EXISTS fin_operacoes (chave TEXT PRIMARY KEY, assinatura TEXT NOT NULL, resposta TEXT NOT NULL);`);
    if(!all('PRAGMA table_info(gastos)').some(c=>c.name==='vencimento')) db.run('ALTER TABLE gastos ADD COLUMN vencimento TEXT');
    for(const a of all('SELECT * FROM atendimentos')) syncAttendance(a.id);
    for(const g of all('SELECT * FROM gastos')) {
      db.run('UPDATE gastos SET vencimento=? WHERE id=?',[g.data_hora.slice(0,10),g.id]);
      if(g.data_hora<=now())movement({tipo:'gasto',referencia:g.id,valor:-cents(g.valor),data_hora:g.data_hora,descricao:g.descricao,automatico:1});
    }
    db.run("INSERT OR REPLACE INTO config VALUES ('financeiro_schema','1')");
  });
}
export function guardAttendance(value) {
  if(total(`SELECT SUM(i.valor_centavos) total FROM fin_comissao_itens i JOIN fin_movimentos m ON m.id=i.movimento_id WHERE i.atendimento_id=? AND m.estornado_em IS NULL`,[value])>0)
    invalid('Este atendimento tem comissão paga. Estorne o pagamento no extrato antes de corrigir ou excluir.',409);
  if(one("SELECT id FROM fin_movimentos WHERE tipo='recebimento' AND referencia=? AND automatico=0 AND estornado_em IS NULL",[value]))
    invalid('Este cartão já foi recebido. Estorne o recebimento no extrato antes de corrigir ou excluir.',409);
}
export function removeAttendance(value) {
  guardAttendance(value); cancelSource('recebimento',value,'Atendimento excluído');
}
export function syncAttendance(value) {
  const a=one('SELECT * FROM atendimentos WHERE id=?',[value]);
  cancelSource('recebimento',value,'Correção do atendimento');
  if(a.metodo_pagamento==='cartao') {
    db.run('INSERT OR IGNORE INTO fin_cartoes (atendimento_id) VALUES (?)',[value]);
    db.run('UPDATE fin_cartoes SET taxa_centavos=MIN(taxa_centavos,?) WHERE atendimento_id=?',[cents(a.valor_cobrado)+cents(a.valor_tinta),value]);
  } else {
    db.run('DELETE FROM fin_cartoes WHERE atendimento_id=?',[value]);
    movement({tipo:'recebimento',referencia:value,valor:cents(a.valor_cobrado)+cents(a.valor_tinta),data_hora:a.data_hora,descricao:'Atendimento #'+value+' · '+a.metodo_pagamento,automatico:1});
  }
}
export function guardExpense(value) {
  if(one("SELECT id FROM fin_movimentos WHERE tipo='gasto' AND referencia=? AND automatico=0 AND estornado_em IS NULL",[value]))
    invalid('Esta conta tem pagamento registrado. Estorne o pagamento no extrato antes de corrigir ou excluir.',409);
}
export function syncExpense(value, body={}, old=null) {
  const g=one('SELECT * FROM gastos WHERE id=?',[value]);
  const wasPaid=one("SELECT id FROM fin_movimentos WHERE tipo='gasto' AND referencia=? AND estornado_em IS NULL",[value]);
  const status=body.situacao ?? (old ? (wasPaid?'pago':'pendente') : 'pago');
  if(!['pago','pendente'].includes(status)) invalid('Escolha pago ou a pagar.');
  const vencimento=day(body.vencimento ?? old?.vencimento ?? g.data_hora.slice(0,10));
  db.run('UPDATE gastos SET vencimento=? WHERE id=?',[vencimento,value]);
  cancelSource('gasto',value,'Correção da conta');
  if(status==='pago') movement({tipo:'gasto',referencia:value,valor:-cents(g.valor),data_hora:date(body.pago_em ?? g.data_hora),descricao:g.descricao,automatico:1});
}
export function removeExpense(value) {guardExpense(value);cancelSource('gasto',value,'Conta excluída');}
export function expenseDetails(rows) {
  return rows.map(g=>{
    const pago=-total("SELECT SUM(valor_centavos) total FROM fin_movimentos WHERE tipo='gasto' AND referencia=? AND estornado_em IS NULL",[g.id]);
    const pago_em=one("SELECT MAX(data_hora) data FROM fin_movimentos WHERE tipo='gasto' AND referencia=? AND estornado_em IS NULL",[g.id])?.data || null;
    return {...g,pago_em,valor_pago:brl(pago),valor_pendente:brl(Math.max(0,cents(g.valor)-pago)),situacao:pago>=cents(g.valor)?'pago':pago>0?'parcial':'pendente'};
  });
}
function commissions(query={}, barbeiro=null) {
  const f=filter(query,'a.data_hora');
  let sql=`SELECT a.id,a.barbeiro_id,a.data_hora,a.valor_comissao,b.nome,
    COALESCE((SELECT SUM(i.valor_centavos) FROM fin_comissao_itens i JOIN fin_movimentos m ON m.id=i.movimento_id WHERE i.atendimento_id=a.id AND m.estornado_em IS NULL),0) pago_centavos
    FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id WHERE b.is_dono=0`+f.sql;
  if(barbeiro){sql+=' AND a.barbeiro_id=?';f.args.push(barbeiro);}
  return all(sql+' ORDER BY a.data_hora,a.id',f.args).map(a=>({...a,pendente_centavos:Math.max(0,cents(a.valor_comissao)-a.pago_centavos)}));
}
export function commissionDetails(rows,query) {
  const data=commissions(query);
  return rows.map(r=>({...r,comissao_paga:brl(data.filter(a=>a.barbeiro_id===r.id).reduce((s,a)=>s+a.pago_centavos,0)),comissao_pendente:brl(data.filter(a=>a.barbeiro_id===r.id).reduce((s,a)=>s+a.pendente_centavos,0))}));
}
export function profit(query={}) {
  const a=filter(query,'a.data_hora'), g=filter(query,'data_hora');
  const receita=total('SELECT SUM(ROUND((a.valor_cobrado+a.valor_tinta)*100)) total FROM atendimentos a WHERE 1=1'+a.sql,a.args);
  const comissao=total('SELECT SUM(ROUND(a.valor_comissao*100)) total FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id WHERE b.is_dono=0'+a.sql,a.args);
  const despesas=total("SELECT SUM(ROUND(valor*100)) total FROM gastos WHERE categoria<>'retirada do dono'"+g.sql,g.args);
  const retiradas=total("SELECT SUM(ROUND(valor*100)) total FROM gastos WHERE categoria='retirada do dono'"+g.sql,g.args);
  const taxas=total('SELECT SUM(c.taxa_centavos) total FROM fin_cartoes c JOIN atendimentos a ON a.id=c.atendimento_id WHERE 1=1'+a.sql,a.args);
  return {faturamento:brl(receita),comissoes:brl(comissao),despesas:brl(despesas),taxas_cartao:brl(taxas),retiradas:brl(retiradas),lucro:brl(receita-comissao-despesas-taxas)};
}
function position() {
  const hoje=now();
  const saldo=total('SELECT SUM(valor_centavos) total FROM fin_movimentos WHERE estornado_em IS NULL AND data_hora<=?',[hoje]);
  const cs=commissions({data_fim:hoje});
  const contas=expenseDetails(all('SELECT * FROM gastos ORDER BY vencimento,id')).filter(g=>g.valor_pendente>0);
  const cartoes=all(`SELECT c.*,a.valor_cobrado,a.valor_tinta,a.data_hora,b.nome FROM fin_cartoes c JOIN atendimentos a ON a.id=c.atendimento_id JOIN barbeiros b ON b.id=a.barbeiro_id
    WHERE NOT EXISTS (SELECT 1 FROM fin_movimentos m WHERE m.tipo='recebimento' AND m.referencia=a.id AND m.estornado_em IS NULL) ORDER BY COALESCE(c.previsto_em,a.data_hora),a.id`)
    .map(c=>({...c,bruto:brl(cents(c.valor_cobrado)+cents(c.valor_tinta)),taxa:brl(c.taxa_centavos),liquido:brl(cents(c.valor_cobrado)+cents(c.valor_tinta)-c.taxa_centavos)}));
  const comissoes=cs.reduce((s,a)=>s+a.pendente_centavos,0), pendencias=contas.reduce((s,g)=>s+cents(g.valor_pendente),0);
  const primeiro=one('SELECT MIN(data_hora) data FROM fin_movimentos WHERE tipo<>\'abertura\' AND estornado_em IS NULL')?.data;
  return {em:hoje,saldo:brl(saldo),comissoes_pendentes:brl(comissoes),contas_pendentes:brl(pendencias),saldo_livre:brl(saldo-comissoes-pendencias),cartao_a_receber:brl(cartoes.reduce((s,c)=>s+cents(c.liquido),0)),contas,cartoes,
    saldo_inicial_configurado:!!one("SELECT id FROM fin_movimentos WHERE tipo='abertura' AND estornado_em IS NULL"),primeiro_movimento:primeiro,
    equipe:Object.values(cs.reduce((result,a)=>{const r=result[a.barbeiro_id]??={id:a.barbeiro_id,nome:a.nome,pendente_centavos:0};r.pendente_centavos+=a.pendente_centavos;return result;},{})).map(r=>({...r,pendente:brl(r.pendente_centavos)}))};
}
// A retry with the same key returns the original response; a changed payload is rejected.
function operation(req,fn) {
  const chave=req.body.chave;
  if(typeof chave!=='string' || !/^[\w-]{16,100}$/.test(chave)) invalid('Identificador da operação inválido. Reabra o formulário.');
  const assinatura=createHash('sha256').update(req.path+'\n'+JSON.stringify(req.body)).digest('hex');
  const old=one('SELECT * FROM fin_operacoes WHERE chave=?',[chave]);
  if(old){if(old.assinatura!==assinatura)invalid('Esta operação já foi utilizada com outros dados.',409);return JSON.parse(old.resposta);}
  return transaction(()=>{const result=fn(chave);db.run('INSERT INTO fin_operacoes VALUES (?,?,?)',[chave,assinatura,JSON.stringify(result)]);return result;});
}
export function registerFinance(app, auth) {
  migrate();
  app.get('/api/financeiro/posicao',auth,(req,res)=>res.json(position()));
  app.get('/api/financeiro/extrato',auth,(req,res)=>{
    const f=filter(req.query,'data_hora');
    res.json(all('SELECT * FROM fin_movimentos WHERE 1=1'+f.sql+' ORDER BY data_hora DESC,id DESC LIMIT 200',f.args).map(m=>({...m,valor:brl(m.valor_centavos)})));
  });
  app.get('/api/financeiro/comparar',auth,(req,res)=>{
    const atual=period(req.query), anterior=period({data_inicio:req.query.anterior_inicio,data_fim:req.query.anterior_fim});
    if(!atual.data_inicio || !atual.data_fim || !anterior.data_inicio || !anterior.data_fim) invalid('Informe o início e o fim dos dois períodos.');
    const a=profit(atual), b=profit(anterior);
    res.json({atual:a,anterior:b,diferencas:Object.fromEntries(Object.keys(a).map(k=>[k,{valor:brl(Math.round(a[k]*100)-Math.round(b[k]*100)),percentual:b[k]>0?(a[k]-b[k])/b[k]*100:null}]))});
  });
  app.post('/api/financeiro/movimentos',auth,(req,res)=>res.json(operation(req,chave=>{
    const tipo=req.body.tipo;
    if(!['abertura','aporte'].includes(tipo)) invalid('Tipo de movimento inválido. Retiradas devem ser registradas em Gastos.');
    const valor=cents(req.body.valor), data_hora=date(req.body.data_hora), descricao=name(req.body.descricao);
    if(tipo==='aporte' && valor<=0)invalid('O aporte deve ser maior que zero.');
    if(tipo==='abertura') {
      if(one("SELECT id FROM fin_movimentos WHERE tipo='abertura' AND estornado_em IS NULL")) invalid('O saldo inicial já foi informado. Estorne o lançamento para corrigir.',409);
      const primeiro=one("SELECT MIN(data_hora) data FROM fin_movimentos WHERE estornado_em IS NULL")?.data;
      if(primeiro && data_hora>primeiro)invalid('O saldo inicial deve representar o dinheiro existente antes do primeiro movimento registrado.');
    }
    return {id:movement({tipo,valor,data_hora,descricao,operacao:chave})};
  })));
  app.post('/api/financeiro/comissoes/pagar',auth,(req,res)=>res.json(operation(req,chave=>{
    const barbeiro=id(req.body.barbeiro_id), valor=cents(req.body.valor), data_hora=date(req.body.data_hora);
    const rows=commissions(req.body,barbeiro), pendente=rows.reduce((s,a)=>s+a.pendente_centavos,0);
    if(valor<=0 || valor>pendente) invalid('O pagamento deve ser maior que zero e não pode ultrapassar a comissão pendente.',409);
    if(rows.some(a=>a.pendente_centavos>0 && a.data_hora.slice(0,10)>data_hora.slice(0,10)))invalid('O pagamento não pode anteceder os atendimentos selecionados.');
    const movimento=movement({tipo:'comissao',referencia:barbeiro,valor:-valor,data_hora,descricao:'Comissão · '+rows[0].nome,operacao:chave});
    let restante=valor;
    for(const a of rows){const pago=Math.min(restante,a.pendente_centavos);if(pago>0){db.run('INSERT INTO fin_comissao_itens VALUES (?,?,?)',[movimento,a.id,pago]);restante-=pago;}}
    return {id:movimento};
  })));
  app.post('/api/financeiro/contas/:id/pagar',auth,(req,res)=>res.json(operation(req,chave=>{
    const g=one('SELECT * FROM gastos WHERE id=?',[id(req.params.id)]);if(!g)invalid('Conta não encontrada.',404);
    const valor=cents(req.body.valor), pendente=cents(expenseDetails([g])[0].valor_pendente);
    if(valor<=0 || valor>pendente)invalid('O pagamento não pode ultrapassar o saldo pendente.',409);
    return {id:movement({tipo:'gasto',referencia:g.id,valor:-valor,data_hora:date(req.body.data_hora),descricao:g.descricao,operacao:chave})};
  })));
  app.post('/api/financeiro/cartoes/:id/previsao',auth,(req,res)=>res.json(operation(req,()=>{
    const value=id(req.params.id), c=one('SELECT * FROM fin_cartoes WHERE atendimento_id=?',[value]);if(!c)invalid('Cartão não encontrado.',404);
    if(one("SELECT id FROM fin_movimentos WHERE tipo='recebimento' AND referencia=? AND estornado_em IS NULL",[value]))invalid('Este recebimento já foi confirmado.',409);
    const a=one('SELECT * FROM atendimentos WHERE id=?',[value]),taxa=cents(req.body.taxa);
    if(taxa>cents(a.valor_cobrado)+cents(a.valor_tinta))invalid('A taxa não pode ultrapassar o valor da venda.');
    db.run('UPDATE fin_cartoes SET taxa_centavos=?,previsto_em=? WHERE atendimento_id=?',[taxa,day(req.body.previsto_em),value]);return {success:true};
  })));
  app.post('/api/financeiro/cartoes/:id/receber',auth,(req,res)=>res.json(operation(req,chave=>{
    const value=id(req.params.id),c=one('SELECT * FROM fin_cartoes WHERE atendimento_id=?',[value]);if(!c)invalid('Cartão não encontrado.',404);
    if(one("SELECT id FROM fin_movimentos WHERE tipo='recebimento' AND referencia=? AND estornado_em IS NULL",[value]))invalid('Este cartão já foi recebido.',409);
    const a=one('SELECT * FROM atendimentos WHERE id=?',[value]),taxa=cents(req.body.taxa),bruto=cents(a.valor_cobrado)+cents(a.valor_tinta),data_hora=date(req.body.data_hora);
    if(taxa>bruto)invalid('A taxa não pode ultrapassar o valor da venda.');
    if(data_hora.slice(0,10)<a.data_hora.slice(0,10))invalid('O recebimento não pode anteceder a venda.');
    db.run('UPDATE fin_cartoes SET taxa_centavos=? WHERE atendimento_id=?',[taxa,value]);
    return {id:movement({tipo:'recebimento',referencia:value,valor:bruto-taxa,data_hora,descricao:'Cartão · atendimento #'+value,operacao:chave})};
  })));
  app.post('/api/financeiro/movimentos/:id/estornar',auth,(req,res)=>res.json(operation(req,()=>{
    const m=one('SELECT * FROM fin_movimentos WHERE id=?',[id(req.params.id)]);if(!m)invalid('Movimento não encontrado.',404);
    if(m.estornado_em)invalid('Este movimento já foi estornado.',409);
    if(m.automatico && m.tipo==='recebimento')invalid('Corrija ou exclua o atendimento no Histórico do Dono para ajustar este recebimento.');
    db.run('UPDATE fin_movimentos SET estornado_em=?,motivo=? WHERE id=?',[now(),name(req.body.motivo),m.id]);return {success:true};
  })));
}
