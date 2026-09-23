/*
 * Sistema de Gestão para Barbearia
 * Autor: Carlos Alberto
 * Contato: alberttcarlosu.u@gmail.com
 * Licença: MIT
 * Criado em: 2026
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SQL = await require('../backend/node_modules/sql.js')();

const REAL_DB = path.join(__dirname, '..', 'backend', 'barbearia.db');
const OUT_DB = process.env.SEED_OUT ? path.resolve(process.env.SEED_OUT) : REAL_DB;
const DAYS = Number(process.argv[2] || 730);
const FORCE = process.argv.includes('--force');
const hoje = new Date();
const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 20, 0, 0));
const inicio = new Date(fim.getTime() - (DAYS - 1) * 86400000);

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260922);

function atomicWrite(target, data) {
  const tmp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  fs.renameSync(tmp, target);
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
function cents(v) {
  return Math.round(v * 100);
}
function diaTo(d, hora) {
  return d.toISOString().slice(0, 10) + 'T' + hora + ':00.000Z';
}
function addDias(data, dias) {
  return new Date(data.getTime() + dias * 86400000);
}
function fimDoMes(data) {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0, 22, 0, 0));
}
function chaveMes(data) {
  return data.toISOString().slice(0, 7);
}
function pick(lista, pesos) {
  const total = pesos.reduce((s, v) => s + v, 0);
  let r = rand() * total;
  for (let i = 0; i < lista.length; i++) {
    r -= pesos[i];
    if (r <= 0) return lista[i];
  }
  return lista[lista.length - 1];
}

const original = fs.existsSync(REAL_DB) ? fs.readFileSync(REAL_DB) : null;
if (!original) throw Error('Banco não encontrado: ' + REAL_DB);
const db = new SQL.Database(new Uint8Array(original));
const q = (sql, args = []) => {
  const r = db.exec(sql, args)[0];
  return r ? r.values.map(v => Object.fromEntries(r.columns.map((k, i) => [k, v[i]]))) : [];
};
const atuais = Number(q('SELECT COUNT(*) c FROM atendimentos')[0]?.c || 0);
if (atuais > 50 && !FORCE) throw Error('Banco já tem ' + atuais + ' atendimentos. Use --force para adicionar a demonstração mesmo assim.');

const barbeiros = q('SELECT * FROM barbeiros');
const dono = barbeiros.find(b => b.is_dono === 1);
const colaboradores = barbeiros.filter(b => b.is_dono === 0);
const servicos = q('SELECT * FROM servicos WHERE ativo = 1').filter(s => s.apenas_dono !== 1 || dono);
if (!dono || colaboradores.length === 0 || servicos.length === 0) throw Error('Cadastre o dono, um colaborador e serviços antes de gerar a demonstração.');

const pesoServico = { 'Corte Simples': 1.2, Barba: 1.0, 'Corte + Barba': 1.6, Pigmentação: 0.3, 'Corte Infantil': 0.5, Degradê: 1.5, Luzes: 0.6, Nevou: 0.4, Reflexo: 0.4 };
const pesos = servicos.map(s => pesoServico[s.nome] || 0.8);
const tintaExtra = ['Luzes', 'Nevou', 'Reflexo', 'Pigmentação'];
const colabs = colaboradores.map(b => ({ b, p: 0.5 + rand() }));
const horarios = ['09:10', '09:50', '10:20', '10:45', '11:00', '11:35', '13:10', '13:45', '14:20', '14:55', '15:30', '16:05', '16:40', '17:15', '17:50', '18:25', '19:00', '19:35'];
const clientes = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Costa'];

db.run('BEGIN');
if (FORCE) {
  db.run('DELETE FROM fin_comissao_itens');
  db.run('DELETE FROM fin_movimentos');
  db.run('DELETE FROM fin_cartoes');
  db.run('DELETE FROM atendimento_itens');
  db.run('DELETE FROM atendimentos');
  db.run('DELETE FROM gastos');
}
if (!db.exec('PRAGMA table_info(gastos)')[0]?.values.some(r => r[1] === 'vencimento')) db.run('ALTER TABLE gastos ADD COLUMN vencimento TEXT');

const stAt = db.prepare('INSERT INTO atendimentos (barbeiro_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao,data_hora,observacao,metodo_pagamento) VALUES (?,?,?,?,?,?,?,?,?,?)');
const stIt = db.prepare('INSERT INTO atendimento_itens (atendimento_id,servico_id,valor_cobrado,valor_tinta,tem_pigmentacao,comissao_percentual,valor_comissao) VALUES (?,?,?,?,?,?,?)');
const stMov = db.prepare('INSERT INTO fin_movimentos (operacao,tipo,referencia,valor_centavos,data_hora,descricao,automatico) VALUES (?,?,?,?,?,?,?)');
const stCar = db.prepare('INSERT OR IGNORE INTO fin_cartoes (atendimento_id,taxa_centavos,previsto_em) VALUES (?,?,?)');
const stGas = db.prepare('INSERT INTO gastos (categoria,descricao,valor,metodo_pagamento,data_hora,observacao,vencimento) VALUES (?,?,?,?,?,?,?)');
const stCom = db.prepare('INSERT INTO fin_comissao_itens (movimento_id,atendimento_id,valor_centavos) VALUES (?,?,?)');

let total = 0, totalItens = 0;
const comissoesPagar = [];
let primeiroData = null;

for (let d = 0; d < DAYS; d++) {
  const dia = addDias(inicio, d);
  const weekday = dia.getUTCDay();
  const capacidade = Math.max(3, Math.round(30 + (rand() * 6 - 3)) + (d > DAYS - 90 ? Math.round(rand() * 2) : 0));
  for (let k = 0; k < capacidade; k++) {
    const ehDono = rand() < 0.14;
    const barbeiro = ehDono ? dono : pick(colabs.map(c => c.b), colabs.map(c => c.p));
    const hora = horarios[Math.floor(rand() * horarios.length)];
    const dataHora = diaTo(dia, hora);
    const metodo = rand() < 0.35 ? 'dinheiro' : rand() < 0.8 ? 'pix' : 'cartao';
    const nItens = 1 + (rand() < 0.3 ? 1 : 0) + (rand() < 0.07 ? 1 : 0);
    const escolhidos = [];
    while (escolhidos.length < nItens && escolhidos.length < servicos.length) {
      const s = pick(servicos, pesos);
      if (!escolhidos.includes(s)) escolhidos.push(s);
    }
    const itens = escolhidos.map(s => {
      let valorTinta = 0, pigment = 0;
      if (tintaExtra.includes(s.nome)) {
        if (rand() < 0.7) { valorTinta = round2(15 + rand() * 65); pigment = 1; }
      } else if (rand() < 0.02) { valorTinta = round2(10 + rand() * 30); pigment = 1; }
      const pct = barbeiro.is_dono ? 100 : (s.comissao_fixa_pct != null ? s.comissao_fixa_pct : Number(barbeiro.comissao_percentual));
      const valorCom = barbeiro.is_dono ? round2(s.valor + valorTinta) : round2(s.valor * pct / 100);
      return { s, valorTinta, pigment, pct, valorCom };
    });
    const bruto = round2(itens.reduce((s, i) => s + i.s.valor, 0));
    const tinta = round2(itens.reduce((s, i) => s + i.valorTinta, 0));
    const comTotal = round2(itens.reduce((s, i) => s + i.valorCom, 0));
    const comPct = bruto > 0 ? round2((comTotal / bruto) * 100) : 0;
    const temPig = (itens.some(i => i.pigment) || tinta > 0) ? 1 : 0;
    const obs = rand() < 0.1 ? 'Cliente ' + clientes[Math.floor(rand() * clientes.length)] : null;
    stAt.run([barbeiro.id, itens[0].s.id, bruto, tinta, temPig, comPct, comTotal, dataHora, obs, metodo]);
    const atId = q('SELECT last_insert_rowid() id')[0].id;
    for (const i of itens) {
      stIt.run([atId, i.s.id, i.s.valor, i.valorTinta, i.pigment, i.pct, i.valorCom]);
      totalItens++;
    }
    const brutoCents = cents(bruto) + cents(tinta);
    if (metodo === 'cartao') {
      const taxa = Math.round(brutoCents * (rand() < 0.8 ? 0.029 : 0.0399));
      const previsto = addDias(dia, 1 + Math.floor(rand() * 5));
      stCar.run([atId, taxa, previsto.toISOString().slice(0, 10)]);
      if (previsto <= fim) stMov.run([crypto.randomUUID(), 'recebimento', atId, brutoCents - taxa, diaTo(previsto, '10:30'), 'Cartão · atendimento #' + atId, 0]);
    } else {
      stMov.run([crypto.randomUUID(), 'recebimento', atId, brutoCents, dataHora, 'Atendimento #' + atId + ' · ' + metodo, 1]);
    }
    const comCents = cents(comTotal);
    if (!barbeiro.is_dono && comCents > 0) comissoesPagar.push({ barbeiroId: barbeiro.id, barbeiroNome: barbeiro.nome, atId, comCents, mes: chaveMes(dia) });
    total++;
    if (primeiroData === null) primeiroData = dataHora;
  }
  if (dia.getUTCDate() === 1) stGas.run(['aluguel', 'Aluguel da loja', 2500, 'pix', diaTo(dia, '08:00'), 'demonstração', dia.toISOString().slice(0, 10)]);
  if (dia.getUTCDate() === 5) stGas.run(['energia', 'Conta de energia ' + dia.toISOString().slice(0, 7), round2(230 + rand() * 170), 'pix', diaTo(dia, '09:00'), null, dia.toISOString().slice(0, 10)]);
  if (dia.getUTCDate() === 10) stGas.run(['internet', 'Internet e telefone', 120, 'pix', diaTo(dia, '09:30'), null, dia.toISOString().slice(0, 10)]);
  if (dia.getUTCDate() === 15) stGas.run(['produtos', 'Produtos e materiais', round2(850 + rand() * 700), 'cartao', diaTo(dia, '10:00'), null, dia.toISOString().slice(0, 10)]);
  if (dia.getUTCDate() === 28) stGas.run(['retirada do dono', 'Retirada do dono', 4000, 'pix', diaTo(dia, '12:00'), null, dia.toISOString().slice(0, 10)]);
  if (rand() < 0.008) stGas.run(['manutenção', 'Manutenção / equipamento', round2(150 + rand() * 500), 'pix', diaTo(dia, '11:00'), null, dia.toISOString().slice(0, 10)]);
}

const gasIds = q('SELECT id, valor, data_hora FROM gastos');
for (const g of gasIds) stMov.run([crypto.randomUUID(), 'gasto', g.id, -cents(g.valor), g.data_hora, 'Conta #' + g.id, 1]);

const abertura = new Date(Math.min(new Date(primeiroData).getTime(), inicio.getTime()) - 86400000);
stMov.run([crypto.randomUUID(), 'abertura', null, 300000, abertura.toISOString(), 'Saldo inicial da demonstração', 0]);

const porMes = new Map();
for (const c of comissoesPagar) {
  if (!porMes.has(c.mes)) porMes.set(c.mes, []);
  porMes.get(c.mes).push(c);
}
for (const [mes, lista] of porMes) {
  const agrupado = new Map();
  for (const c of lista) {
    if (!agrupado.has(c.barbeiroId)) agrupado.set(c.barbeiroId, []);
    agrupado.get(c.barbeiroId).push(c);
  }
  for (const [barbeiroId, items] of agrupado) {
    const soma = items.reduce((s, c) => s + c.comCents, 0);
    if (soma <= 0) continue;
    const pagamento = fimDoMes(new Date(items[0].mes + '-01T12:00:00.000Z'));
    if (pagamento > fim) continue;
    const data = diaTo(pagamento, '22:00');
    stMov.run([crypto.randomUUID(), 'comissao', barbeiroId, -soma, data, 'Comissão · ' + items[0].barbeiroNome, 0]);
    const movId = q('SELECT last_insert_rowid() id')[0].id;
    for (const c of items) stCom.run([movId, c.atId, c.comCents]);
  }
}

db.run('COMMIT');

const bytes = db.export();
if (OUT_DB === REAL_DB) fs.copyFileSync(REAL_DB, path.join(__dirname, '..', 'backend', 'backups', 'demonstracao-antes-' + Date.now() + '.db'));
atomicWrite(OUT_DB, bytes);
const ver = new SQL.Database(bytes);
const c = s => Number(ver.exec(s)[0]?.values[0]?.[0] || 0);
const resumo = {
  dias: DAYS,
  atendimentos: c('SELECT COUNT(*) FROM atendimentos'),
  itens: c('SELECT COUNT(*) FROM atendimento_itens'),
  faturamento: Number(ver.exec('SELECT ROUND(SUM(valor_cobrado+valor_tinta),2) v FROM atendimentos')[0]?.values[0]?.[0] || 0),
  comissao_colaboradores: Number(ver.exec('SELECT ROUND(SUM(a.valor_comissao),2) v FROM atendimentos a JOIN barbeiros b ON b.id=a.barbeiro_id WHERE b.is_dono=0')[0]?.values[0]?.[0] || 0),
  gastos: c('SELECT COUNT(*) FROM gastos'),
  movimentos: c('SELECT COUNT(*) FROM fin_movimentos'),
  cartoes_a_receber: c("SELECT COUNT(*) FROM fin_cartoes c WHERE NOT EXISTS (SELECT 1 FROM fin_movimentos m WHERE m.tipo='recebimento' AND m.referencia=c.atendimento_id AND m.estornado_em IS NULL)"),
  comissoes_quitadas: c('SELECT COUNT(*) FROM fin_comissao_itens'),
};
console.log(JSON.stringify(resumo, null, 2));
console.log('Banco atualizado em ' + OUT_DB + '. Reinicie o servidor para ver os dados.');