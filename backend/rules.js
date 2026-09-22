/*
 * Sistema de Gestão para Barbearia
 * Autor: Carlos Alberto
 * Contato: alberttcarlosu.u@gmail.com
 * Licença: MIT
 * Criado em: 2026
 */
export function invalid(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export function number(value, label, max = 1000000000) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') invalid(label + ' deve ser um número.');
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) invalid(label + ' deve estar entre 0 e ' + max + '.');
  return parsed;
}
export function money(value, label = 'Valor') {
  const parsed = number(value, label);
  const cents = Math.round((parsed + Number.EPSILON) * 100);
  if (Math.abs(parsed * 100 - cents) > 0.00001) invalid(label + ' deve ter no máximo duas casas decimais.');
  return cents / 100;
}
export function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
export function percent(value) { return number(value, 'Comissão', 100); }
export function id(value) {
  const parsed = number(value, 'Identificador', Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(parsed) || parsed < 1) invalid('Identificador inválido.');
  return parsed;
}
export function flag(value = 0) {
  if ([true, 1, '1'].includes(value)) return 1;
  if ([false, 0, '0'].includes(value)) return 0;
  invalid('Indicador deve ser 0 ou 1.');
}
export function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) invalid('Informe um nome com 1 a 200 caracteres.');
  return value.trim();
}
export function isPigmentacao(value) { return /^(pigmenta|pintar)/i.test(value.trim()); }
export function dayBounds(now = new Date()) {
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    fim: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  };
}
export function period(query) {
  const result = {};
  for (const key of ['data_inicio', 'data_fim']) {
    const value = query[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) invalid('Período inválido. Use uma data e hora em UTC.');
    const normalized = new Date(value).toISOString();
    if (normalized.slice(0,19) !== value.slice(0,19)) invalid('Data inexistente.');
    result[key] = normalized;
  }
  if (result.data_inicio && result.data_fim && result.data_inicio > result.data_fim) invalid('A data inicial deve ser anterior à final.');
  return result;
}
