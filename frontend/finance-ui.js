let finSequence=0, finData=null, finAction=null, comparisonSequence=0, finExtrato=[];
const finMoney=moedaUI;
const finDate=value=>value?new Date(value.includes('T')?value:value+'T12:00:00').toLocaleDateString('pt-BR'):'Sem previsão';
const finMoment=value=>value===dataLocalISO(new Date())?new Date().toISOString():dataInputParaUtcFim(value);
const finPeriodoTexto=()=>{const i=document.getElementById('rel-data-inicio')?.value,f=document.getElementById('rel-data-fim')?.value,curto=v=>v?v.split('-').reverse().join('/'):'';return i&&f?curto(i)+' a '+curto(f):i?'a partir de '+curto(i):f?'até '+curto(f):'todo o período';};
const finButton=(action,label,value='',extra='')=>`<button type="button" class="btn btn-outline btn-small" data-fin="${action}" data-id="${value}" ${extra}>${label}</button>`;
const finValue=(label,value,note,emphasis=false)=>`<div class="kpi-card ${emphasis?'resultado-destaque':''}"><div class="kpi-title">${label}</div><div class="kpi-value ${value<0?'owner-negative':''}">${finMoney(value)}</div><div class="kpi-footer">${note}</div></div>`;

const finTipoBadge=m=>{
  if(m.tipo==='recebimento')return m.descricao&&m.descricao.indexOf('Cartão')===0
    ?'<span class="badge fin-badge fin-badge-cartao"><i class="fas fa-credit-card"></i> Cartão</span>'
    :'<span class="badge fin-badge fin-badge-entrada"><i class="fas fa-arrow-down"></i> Entrada</span>';
  if(m.tipo==='comissao')return '<span class="badge fin-badge fin-badge-comissao"><i class="fas fa-hand-holding-dollar"></i> Comissão</span>';
  if(m.tipo==='gasto')return '<span class="badge fin-badge fin-badge-gasto"><i class="fas fa-arrow-up"></i> Despesa</span>';
  if(m.tipo==='aporte')return '<span class="badge fin-badge fin-badge-aporte"><i class="fas fa-circle-plus"></i> Aporte</span>';
  if(m.tipo==='abertura')return '<span class="badge fin-badge fin-badge-abertura"><i class="fas fa-flag"></i> Saldo inicial</span>';
  return '';
};
const finDiaExtrato=iso=>new Date(iso.includes('T')?iso:iso+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
function renderExtrato(extrato){
  finExtrato=extrato;
  let html='',dataAnterior='';
  for(const m of extrato){
    const data=(m.data_hora||'').slice(0,10),estornado=!!m.estornado_em;
    const acao=(!estornado&&!(m.automatico&&m.tipo==='recebimento'))
      ?finButton('estorno','Desfazer',m.id,'title="Desfazer este lançamento e devolver a obrigação pendente, quando houver"')
      :'';
    if(data&&data!==dataAnterior){html+=`<div class="fin-date-sep">${finDiaExtrato(m.data_hora)}</div>`;dataAnterior=data;}
    html+=`<div class="fin-list-row${estornado?' fin-cancelled':''}">
      <div class="fin-extrato-desc">${finTipoBadge(m)}<strong>${escapeHtml(m.descricao)}</strong><small>${finDate(m.data_hora)}${estornado?' · <span class="fin-estornado-tag"><i class="fas fa-rotate-left"></i> Desfeito · '+escapeHtml(m.motivo||'motivo não informado')+'</span>':''}</small></div>
      <strong class="${m.valor<0?'owner-negative':'fin-entrada'}">${finMoney(m.valor)}</strong>
      ${acao}
    </div>`;
  }
  return html||'<p class="fin-empty">Nenhum movimento no período.</p>';
}

document.querySelector('[data-subtab="financeiro"]').innerHTML='<i class="fas fa-wallet"></i> Caixa';
document.querySelector('#rel-sub-financeiro .financeiro-intro h3').textContent='Caixa da barbearia';
document.querySelector('#rel-sub-financeiro .financeiro-intro p').textContent='Saldo único: dinheiro e conta juntos. Cartão entra no saldo somente após confirmar o recebimento.';
document.querySelector('.financeiro-periodo-badge').textContent='Posição atual · todos os períodos';
document.querySelector('.rel-subtabs').insertAdjacentHTML('beforeend','<button type="button" class="rel-subtab" data-subtab="comparar" onclick="mostrarSubAbaRelatorio(\'comparar\')"><i class="fas fa-chart-line"></i> Comparar</button>');
document.getElementById('relatorio').insertAdjacentHTML('beforeend',`
<div class="rel-subaba" id="rel-sub-comparar" data-tab="comparar" style="display:none">
 <div class="financeiro-intro"><div><h3>Comparação de resultados</h3><p>Compare o lucro dos períodos, sem misturar retiradas e saldo de caixa.</p></div></div>
 <form id="fin-compare-form" class="custom-card">
  <div class="form-group"><label for="fin-compare-mode">Comparar</label><select id="fin-compare-mode"><option value="mes">Meses completos</option><option value="ano">Anos completos</option><option value="acumulado">Ano atual até hoje × mesmo período anterior</option><option value="custom">Períodos personalizados</option></select></div>
  <div id="fin-compare-months" class="form-grid-2"><div class="form-group"><label for="fin-month-a">Mês analisado</label><input type="month" id="fin-month-a" required></div><div class="form-group"><label for="fin-month-b">Mês de comparação</label><input type="month" id="fin-month-b" required></div></div>
  <div id="fin-compare-years" class="form-grid-2" hidden><div class="form-group"><label for="fin-year-a">Ano analisado</label><input type="number" id="fin-year-a" min="1900" max="2200"></div><div class="form-group"><label for="fin-year-b">Ano de comparação</label><input type="number" id="fin-year-b" min="1900" max="2200"></div></div>
  <div id="fin-compare-custom" hidden><div class="form-grid-2"><div class="form-group"><label for="fin-start-a">Período analisado: início</label><input type="date" id="fin-start-a"></div><div class="form-group"><label for="fin-end-a">Fim</label><input type="date" id="fin-end-a"></div></div><div class="form-grid-2"><div class="form-group"><label for="fin-start-b">Período de comparação: início</label><input type="date" id="fin-start-b"></div><div class="form-group"><label for="fin-end-b">Fim</label><input type="date" id="fin-end-b"></div></div></div>
  <button class="btn btn-primary" type="submit">Comparar períodos</button>
 </form>
 <p id="fin-compare-status" class="owner-note" role="status"></p>
 <div class="table-responsive"><table id="fin-compare-table"><thead><tr><th>Indicador</th><th>Analisado</th><th>Comparação</th><th>Diferença</th><th>Variação</th></tr></thead><tbody><tr><td colspan="5">Selecione os períodos para comparar.</td></tr></tbody></table></div>
</div>`);

document.getElementById('gasto-data').previousElementSibling.textContent='Data da despesa (para o lucro)';
document.getElementById('gasto-pagamento').closest('.form-grid-2').insertAdjacentHTML('afterend',`
<div class="form-grid-2"><div class="form-group"><label for="gasto-situacao">Situação</label><select id="gasto-situacao"><option value="pendente">A pagar</option><option value="pago">Já pago</option></select></div><div class="form-group"><label for="gasto-vencimento">Vencimento</label><input type="date" id="gasto-vencimento" required></div></div>
<div class="form-group" id="gasto-pago-grupo"><label for="gasto-pago-em">Data do pagamento</label><input type="date" id="gasto-pago-em"></div>
<p class="owner-note"><strong>Despesa ou conta:</strong> custo da barbearia — sai do caixa e reduz o lucro. <strong>Retirada do dono:</strong> dinheiro que você pega para si — sai só do caixa, sem reduzir o lucro. Comissões são pagas na aba Equipe ou Caixa, nunca como gasto.</p>`);
document.querySelector('#gastos .section-subtitle').textContent='Registre despesas, contas a pagar e retiradas. Pagamentos parciais ficam disponíveis na aba Caixa do relatório.';
document.querySelector('#rel-sub-equipe .equipe-note').textContent='Selecione a semana ou as datas do fechamento. O valor pendente considera os pagamentos já registrados para esses atendimentos. Atendimentos do dono pertencem à barbearia.';
document.body.insertAdjacentHTML('beforeend',`
<dialog id="fin-dialog" class="owner-dialog" aria-labelledby="fin-dialog-title"><form id="fin-action-form">
 <h3 id="fin-dialog-title"></h3><p id="fin-dialog-note" class="owner-note"></p>
 <div class="form-group" id="fin-value-group"><label for="fin-value">Valor (R$)</label><input type="number" id="fin-value" min="0.01" step="0.01"></div>
 <div class="form-group" id="fin-fee-group"><label for="fin-fee">Taxa do cartão (R$)</label><input type="number" id="fin-fee" min="0" step="0.01"></div>
 <div class="form-group" id="fin-date-group"><label for="fin-date" id="fin-date-label">Data</label><input type="date" id="fin-date"></div>
 <div class="form-group" id="fin-description-group"><label for="fin-description" id="fin-description-label">Descrição</label><input id="fin-description" maxlength="200"></div>
 <p id="fin-action-error" class="owner-negative" role="alert"></p>
 <div class="owner-actions"><button type="submit" class="btn btn-success" id="fin-submit">Registrar</button><button type="button" class="btn btn-outline" id="fin-cancel">Cancelar</button></div>
</form></dialog>`);

function prepararGastoFinanceiro(g) {
  document.getElementById('gasto-situacao').value=g.id?(g.situacao==='pago'?'pago':'pendente'):'pendente';
  document.getElementById('gasto-vencimento').value=g.vencimento||dataLocalISO(new Date());
  document.getElementById('gasto-pago-em').value=dataLocalISO(g.pago_em?new Date(g.pago_em):new Date());
  atualizarSituacaoGasto();
}
function atualizarSituacaoGasto(){const pago=document.getElementById('gasto-situacao').value==='pago';document.getElementById('gasto-pago-grupo').hidden=!pago;document.getElementById('gasto-pago-em').required=pago;}
document.getElementById('gasto-situacao').onchange=atualizarSituacaoGasto;

renderResumoFinanceiro=function(g) {
  if(typeof g.lucro!=='number'){
    document.getElementById('stats-geral').innerHTML='<p class="owner-note" role="alert">A atualização do servidor ainda não foi carregada. Feche e abra novamente o sistema para consultar o lucro e o caixa.</p>';
    document.getElementById('resumo-financeiro-note')?.remove();return;
  }
  document.getElementById('stats-geral').innerHTML=[
    finValue('Faturamento',g.faturamento,(g.total_atendimentos||0)+' atendimentos · serviços e tinta'),
    finValue('Comissões da equipe',g.comissoes,'Geradas pelos atendimentos do período'),
    finValue('Despesas e taxas',Number(g.despesas||0)+Number(g.taxas_cartao||0),'Gastos (pagos ou a pagar) + taxas de cartão do período'),
    finValue('Lucro da barbearia',g.lucro,'Faturamento − comissões − despesas e taxas',true)
  ].join('');
  let note=document.getElementById('resumo-financeiro-note');
  if(!note){note=document.createElement('p');note.id='resumo-financeiro-note';note.className='owner-note';document.getElementById('stats-geral').after(note);}
  note.textContent='Resumo do período: faturamento − comissões − despesas e taxas = lucro. Retiradas do dono ('+finMoney(g.retiradas)+') e aportes não alteram o lucro: retirada tira dinheiro do caixa, aporte coloca. Veja o dinheiro em mãos na aba Caixa.';
};
renderFinanceiroEquipe=function(rows) {
  if(rows.some(r=>typeof r.comissao_pendente!=='number')){document.getElementById('stats-colaboradores').innerHTML='<p class="owner-note">Reinicie o sistema para consultar os pagamentos de comissões.</p>';return;}
  document.getElementById('stats-colaboradores').innerHTML=rows.filter(r=>!r.is_dono).map((r,i)=>`<div class="colaborador-card"><div class="colaborador-card-header">${avatarBarbeiro(r,i)}<div class="colaborador-info"><h4>${escapeHtml(r.nome)}${r.ativo===0?' (inativo)':''}</h4><span class="badge badge-blue">${r.total_atendimentos} atendimentos</span></div></div><dl class="fin-breakdown"><div><dt>Comissão gerada</dt><dd>${finMoney(r.total_comissao_colaborador)}</dd></div><div><dt>Já pago</dt><dd>${finMoney(r.comissao_paga)}</dd></div><div class="fin-pending"><dt>Falta pagar</dt><dd>${finMoney(r.comissao_pendente)}</dd></div></dl>${r.comissao_pendente>0?finButton('equipe','Registrar pagamento',r.id):'<p class="owner-note">Sem comissão pendente neste período.</p>'}</div>`).join('')||'<p class="owner-note">Nenhum barbeiro no período.</p>';
};
renderFinanceiro=async function(pagina=1) {
  const seq=++finSequence,token=relatorioToken(),el=document.getElementById('financeiro-extra');
  el.innerHTML='<p class="owner-note" role="status">Atualizando saldo e obrigações…</p>';
  try {
    const query=periodoUI(document.getElementById('rel-data-inicio').value,document.getElementById('rel-data-fim').value);
    query.set('pagina',Number.isInteger(pagina)?pagina:1);
    const [p,paginaExtrato]=await Promise.all([ownerJson('/financeiro/posicao'),ownerJson('/financeiro/extrato?'+query)]);
    if(seq!==finSequence || token!==relatorioToken())return;
    finData=p;const extrato=paginaExtrato.itens;
    const warning=!p.saldo_inicial_configurado?`<div class="fin-notice"><p><strong>Saldo inicial ainda não informado.</strong> O saldo abaixo soma os movimentos registrados. Informe o dinheiro que já existia antes do primeiro registro, mesmo que seja zero.</p>${finButton('abertura','Informar saldo inicial')}</div>`:'';
    const card=p.cartoes.map(c=>`<div class="fin-list-row"><div><strong>Atendimento #${c.atendimento_id} · ${escapeHtml(c.nome)}</strong><small>${finDate(c.data_hora)} · previsão: ${finDate(c.previsto_em)}</small><small>Bruto ${finMoney(c.bruto)} · taxa ${finMoney(c.taxa)}</small></div><strong>${finMoney(c.liquido)}</strong><div class="fin-row-actions">${finButton('previsao','Taxa e previsão',c.atendimento_id)}${finButton('receber','Registrar recebimento',c.atendimento_id)}</div></div>`).join('');
    const contas=p.contas.map(g=>`<div class="fin-list-row"><div><strong>${escapeHtml(g.descricao)}</strong><small>${escapeHtml(g.categoria)} · vence ${finDate(g.vencimento)}</small><small>Pago ${finMoney(g.valor_pago)} de ${finMoney(g.valor)}</small></div><strong>${finMoney(g.valor_pendente)}</strong>${finButton('conta','Registrar pagamento',g.id)}</div>`).join('');
    const equipe=p.equipe.filter(r=>r.pendente>0).map(r=>`<div class="fin-list-row"><strong>${escapeHtml(r.nome)}</strong><strong>${finMoney(r.pendente)}</strong>${finButton('equipe-tudo','Registrar pagamento',r.id)}</div>`).join('');
    el.innerHTML=`${warning}<div class="kpi-grid fin-cash-kpis">${finValue(p.saldo_inicial_configurado?'Saldo atual':'Saldo registrado',p.saldo,'Entradas recebidas − saídas pagas')}${finValue('Valores reservados',p.comissoes_pendentes+p.contas_pendentes,'Comissões e contas ainda a pagar')}${finValue('Saldo livre',p.saldo_livre,'Saldo atual − todas as obrigações pendentes',true)}</div>
      <div class="fin-toolbar"><span class="fin-toolbar-group"><strong class="fin-toolbar-label"><i class="fas fa-arrow-down" style="color:var(--emerald)"></i> Entrada</strong>${finButton('aporte','Registrar aporte')}</span><span class="fin-toolbar-group"><strong class="fin-toolbar-label"><i class="fas fa-arrow-up" style="color:#fb7185"></i> Saídas</strong>${finButton('retirada','Retirada do dono')}${finButton('nova-conta','Nova despesa ou conta')}</span></div>
      <p class="owner-note">Qual a diferença? <strong>Despesa ou conta</strong> é custo da barbearia: sai do caixa e reduz o lucro. <strong>Retirada do dono</strong> é o lucro que você tira para si: sai do caixa, sem reduzir o lucro.</p>
      <p class="owner-note">Posição atual, independente do filtro do relatório. Cartão a receber: <strong>${finMoney(p.cartao_a_receber)}</strong> — ainda fora do saldo. ${p.saldo_livre<0?'O saldo atual não cobre todas as obrigações registradas.':''}</p>
      <section class="custom-card fin-panel"><h4>Comissões a pagar <span>${finMoney(p.comissoes_pendentes)}</span></h4><p class="owner-note">Todos os períodos. Para pagar apenas uma semana, use a aba Equipe.</p>${equipe||'<p class="fin-empty">Nenhuma comissão pendente.</p>'}</section>
      <section class="custom-card fin-panel"><h4>Contas e retiradas a pagar <span>${finMoney(p.contas_pendentes)}</span></h4>${contas||'<p class="fin-empty">Nenhuma conta pendente.</p>'}</section>
      <section class="custom-card fin-panel"><h4>Cartões a receber <span>${finMoney(p.cartao_a_receber)}</span></h4><p class="owner-note">Informe a taxa da operadora e confirme quando o dinheiro entrar. Não registre a mesma taxa novamente em Gastos.</p>${card||'<p class="fin-empty">Nenhum cartão pendente.</p>'}</section>
      <section class="custom-card fin-panel"><h4>Extrato <small class="fin-periodo-texto">Período: ${finPeriodoTexto()}</small></h4><div class="fin-legend"><span><i class="fas fa-circle" style="color:var(--emerald)"></i> Entrada</span><span><i class="fas fa-circle" style="color:#fb7185"></i> Saída</span><span><i class="fas fa-rotate-left" style="color:var(--text-dim)"></i> Desfeito</span></div><p class="owner-note">Movimentos do período, em páginas de 50. Para consertar um lançamento errado, use <strong>Desfazer</strong>: o valor sai do saldo e a obrigação ligada (comissão, conta ou cartão) volta a ficar pendente.</p>${renderExtrato(extrato)}</section>`;
    renderPagination('extrato-paginas',el.querySelector('section:last-child'),paginaExtrato,renderFinanceiro);
  } catch(error){if(seq===finSequence&&token===relatorioToken())el.innerHTML='<p class="owner-negative" role="alert">'+escapeHtml(error.message)+'</p>';}
};
function limparFinanceiroCompleto(){finSequence++;comparisonSequence++;finData=null;finAction=null;document.getElementById('fin-dialog')?.close();document.getElementById('fin-action-form')?.reset();document.querySelector('#fin-compare-table tbody')?.replaceChildren();document.getElementById('fin-compare-status').textContent='';}

function abrirMovimento(action,value) {
  const today=dataLocalISO(new Date());
  document.getElementById('fin-action-form').reset();
  finAction={action,id:Number(value),chave:crypto.randomUUID()};
  let title='',note='',amount='',fee=0,selectedDate=today;
  if(action==='equipe') {
    const r=relatorioCache.find(r=>r.id===Number(value));
    amount=r.comissao_pendente;title='Pagar comissão · '+r.nome;
    const q=periodoUI(document.getElementById('rel-data-inicio').value,document.getElementById('rel-data-fim').value);
    finAction.period=Object.fromEntries(q);note='Pagamento dos atendimentos no período selecionado. Você pode informar um valor parcial.';
  } else if(action==='equipe-tudo') {const r=finData.equipe.find(r=>r.id===Number(value));amount=r.pendente;title='Pagar comissão · '+r.nome;note='Todas as comissões pendentes deste barbeiro. Você pode informar um valor parcial.';}
  else if(action==='conta'){const g=finData.contas.find(g=>g.id===Number(value));amount=g.valor_pendente;title='Pagar · '+g.descricao;note='Registre somente o valor efetivamente pago. O restante continuará pendente.';}
  else if(['receber','previsao'].includes(action)){const c=finData.cartoes.find(c=>c.atendimento_id===Number(value));fee=c.taxa;finAction.bruto=c.bruto;title=action==='receber'?'Receber cartão #'+value:'Taxa e previsão do cartão #'+value;note='Valor bruto: '+finMoney(c.bruto)+'. A taxa será descontada da entrada e do lucro uma única vez.';if(action==='previsao')selectedDate=c.previsto_em||today;}
  else if(action==='abertura'){title='Saldo inicial';amount=0;note='Informe o dinheiro que já existia antes do primeiro movimento do sistema. Não informe o saldo de hoje, pois as entradas registradas já estão sendo somadas.';if(finData.primeiro_movimento){const d=new Date(finData.primeiro_movimento);d.setDate(d.getDate()-1);selectedDate=dataLocalISO(d);}}
  else if(action==='aporte'){title='Aporte na barbearia';note='Dinheiro adicional colocado no negócio. Aumenta o caixa, sem aumentar o lucro.';}
  else if(action==='estorno'){
    const m=finExtrato.find(x=>x.id===Number(value));
    title='Desfazer lançamento';
    note=(m?'<div class="fin-reversal-info">'+escapeHtml(m.descricao)+' · '+finMoney(m.valor)+'</div>':'')
      +'O valor será retirado do saldo. Se houver uma comissão, conta ou cartão ligado a este lançamento, ele volta a ficar pendente para você registrar o valor correto. Preencha o motivo abaixo.';
  }
  document.getElementById('fin-dialog-title').textContent=title;
  document.getElementById('fin-dialog-note').innerHTML=note;
  document.getElementById('fin-action-error').textContent='';
  document.getElementById('fin-value').value=amount;
  document.getElementById('fin-value').min=action==='abertura'?'0':'0.01';
  const feeInput=document.getElementById('fin-fee');
  feeInput.value=fee>0?fee:'';
  feeInput.placeholder='0,00 (sem taxa)';
  document.getElementById('fin-date').value=selectedDate;
  document.getElementById('fin-date-label').textContent=action==='previsao'?'Data prevista':'Data do registro';
  document.getElementById('fin-description-label').textContent=action==='estorno'?'Motivo (obrigatório)':'Descrição';
  document.getElementById('fin-description').value=action==='abertura'?'Saldo anterior ao primeiro registro':'';
  for(const [key,visible] of Object.entries({value:!['receber','previsao','estorno'].includes(action),fee:['receber','previsao'].includes(action),date:action!=='estorno',description:['aporte','abertura','estorno'].includes(action)})){
    document.getElementById('fin-'+key+'-group').hidden=!visible;document.getElementById('fin-'+key).required=visible&&key!=='fee';
  }
  const submit=document.getElementById('fin-submit');
  submit.textContent=action==='estorno'?'Desfazer lançamento':'Registrar';
  submit.className='btn '+(action==='estorno'?'btn-danger':'btn-success');
  document.getElementById('fin-dialog').showModal();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-fin]');if(!button)return;
  if(['nova-conta','retirada'].includes(button.dataset.fin)){showTab('gastos');abrirGasto();if(button.dataset.fin==='retirada')document.getElementById('gasto-categoria').value='retirada do dono';return;}
  try{abrirMovimento(button.dataset.fin,button.dataset.id);}catch(error){mensagemErro(error);}
});
document.getElementById('fin-cancel').onclick=()=>document.getElementById('fin-dialog').close();
document.getElementById('fin-action-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;if(button.disabled)return;
  const a=finAction,body={chave:a.chave};let path='';
  try {
    if(a.action!=='estorno')body.data_hora=finMoment(document.getElementById('fin-date').value);
    if(['equipe','equipe-tudo'].includes(a.action)){path='/financeiro/comissoes/pagar';Object.assign(body,a.period||{},{barbeiro_id:a.id,valor:document.getElementById('fin-value').value});}
    else if(a.action==='conta'){path='/financeiro/contas/'+a.id+'/pagar';body.valor=document.getElementById('fin-value').value;}
    else if(['receber','previsao'].includes(a.action)){path='/financeiro/cartoes/'+a.id+'/'+(a.action==='receber'?'receber':'previsao');body.taxa=Number(document.getElementById('fin-fee').value)||0;if(a.action==='previsao'){delete body.data_hora;body.previsto_em=document.getElementById('fin-date').value;}}
    else if(a.action==='estorno'){path='/financeiro/movimentos/'+a.id+'/estornar';body.motivo=document.getElementById('fin-description').value;}
    else {path='/financeiro/movimentos';Object.assign(body,{tipo:a.action,valor:document.getElementById('fin-value').value,descricao:document.getElementById('fin-description').value});}
    // Freeze a submitted request so a lost response can be retried without paying twice.
    if(a.pending && JSON.stringify({...body,data_hora:a.pending.data_hora})!==JSON.stringify(a.pending))throw Error('Há uma tentativa anterior. Reenvie os mesmos dados para conferir o resultado antes de iniciar outra operação.');
    if(!a.pending)a.pending=body;
    button.disabled=true;
    await ownerJson(path,{method:'POST',body:JSON.stringify(a.pending)});
    document.getElementById('fin-dialog').close();showToast('Registro financeiro salvo.','success');
    await loadRelatorio();if(document.getElementById('gastos').classList.contains('active'))await loadGastos();
  }catch(error){
    if(error.status>=400 && error.status<500){a.pending=null;a.chave=crypto.randomUUID();}
    document.getElementById('fin-action-error').textContent=error.message;
  }finally{button.disabled=false;}
};

const finToday=new Date(), finPreviousMonth=new Date(finToday.getFullYear(),finToday.getMonth()-1,1);
document.getElementById('fin-month-a').value=dataLocalISO(finToday).slice(0,7);
document.getElementById('fin-month-b').value=dataLocalISO(finPreviousMonth).slice(0,7);
document.getElementById('fin-year-a').value=finToday.getFullYear();document.getElementById('fin-year-b').value=finToday.getFullYear()-1;
function finCompareMode(){const mode=document.getElementById('fin-compare-mode').value;for(const [section,active] of [['months',mode==='mes'],['years',mode==='ano'],['custom',mode==='custom']]){const el=document.getElementById('fin-compare-'+section);el.hidden=!active;el.querySelectorAll('input').forEach(input=>{input.required=active;input.disabled=!active;});}}
document.getElementById('fin-compare-mode').onchange=finCompareMode;finCompareMode();
function finCompareRanges(){
  const mode=document.getElementById('fin-compare-mode').value;
  const month=value=>{const [y,m]=value.split('-').map(Number);return [dataLocalISO(new Date(y,m-1,1)),dataLocalISO(new Date(y,m,0))];};
  const year=value=>[value+'-01-01',value+'-12-31'];
  if(mode==='mes')return [...month(document.getElementById('fin-month-a').value),...month(document.getElementById('fin-month-b').value)];
  if(mode==='ano')return [...year(document.getElementById('fin-year-a').value),...year(document.getElementById('fin-year-b').value)];
  if(mode==='acumulado'){const d=new Date(),y=d.getFullYear(),last=Math.min(d.getDate(),new Date(y-1,d.getMonth()+1,0).getDate());return [y+'-01-01',dataLocalISO(d),(y-1)+'-01-01',dataLocalISO(new Date(y-1,d.getMonth(),last))];}
  return ['fin-start-a','fin-end-a','fin-start-b','fin-end-b'].map(id=>document.getElementById(id).value);
}
document.getElementById('fin-compare-form').onsubmit=async event=>{
  event.preventDefault();const seq=++comparisonSequence,token=relatorioToken(),status=document.getElementById('fin-compare-status'),tbody=document.querySelector('#fin-compare-table tbody');
  try {
    const [ai,af,bi,bf]=finCompareRanges();if(!ai||!af||!bi||!bf)throw Error('Preencha os dois períodos.');
    const a=periodoUI(ai,af),b=periodoUI(bi,bf);a.set('anterior_inicio',b.get('data_inicio'));a.set('anterior_fim',b.get('data_fim'));
    status.textContent='Comparando…';tbody.innerHTML='<tr><td colspan="5">Carregando resultados…</td></tr>';
    const result=await ownerJson('/financeiro/comparar?'+a);if(seq!==comparisonSequence||token!==relatorioToken())return;
    status.textContent=finDate(ai)+' a '+finDate(af)+' × '+finDate(bi)+' a '+finDate(bf)+'. '+(af>=dataLocalISO(new Date())||bf>=dataLocalISO(new Date())?'Há um período em andamento ou futuro; os valores ainda podem mudar. ':'')+'Variação percentual não é calculada quando a base é zero ou negativa.';
    const labels={faturamento:'Faturamento',comissoes:'Comissões',despesas:'Despesas',taxas_cartao:'Taxas de cartão',lucro:'Lucro da barbearia',retiradas:'Retiradas (fora do lucro)'};
    tbody.innerHTML=Object.entries(labels).map(([key,label])=>`<tr class="${key==='lucro'?'fin-profit-row':''}"><td>${label}</td><td>${finMoney(result.atual[key])}</td><td>${finMoney(result.anterior[key])}</td><td>${finMoney(result.diferencas[key].valor)}</td><td>${result.diferencas[key].percentual===null?'—':result.diferencas[key].percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</td></tr>`).join('');
  }catch(error){if(seq===comparisonSequence){status.textContent=error.message;tbody.innerHTML='<tr><td colspan="5">Não foi possível comparar os períodos.</td></tr>';}}
};

// Mantém a sub-aba do relatório ao recarregar a página.
(function(){const saved=localStorage.getItem('relSubTab');if(typeof mostrarSubAbaRelatorio==='function'&&['resumo','equipe','financeiro','comparar'].includes(saved)&&saved!=='resumo')mostrarSubAbaRelatorio(saved);})();
