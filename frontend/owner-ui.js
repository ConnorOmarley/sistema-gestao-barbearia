const categoriasGastoUI = ['tinta','giletes','produtos','material','aluguel','energia','manutenção','retirada do dono','outros'];
const pagamentosUI = {dinheiro:'Dinheiro',cartao:'Cartão',pix:'Pix'};
const moedaUI = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const selectOptions = (values, current) => Object.entries(values).map(([value,label])=>'<option value="'+escapeHtml(value)+'"'+(String(current)===value?' selected':'')+'>'+escapeHtml(label)+'</option>').join('');
let gastosUI = [], servicosEdicaoUI = [], atendimentoEdicaoUI = null, sequenciaGastos = 0;

document.querySelector('.navigation-tabs').insertAdjacentHTML('beforeend',
    '<button class="nav-tab" id="nav-tab-gastos" onclick="showTab(\'gastos\')" style="display:none">Gastos</button>');
document.querySelector('main').insertAdjacentHTML('beforeend', `
<section class="tab-section" id="gastos">
 <div class="section-header"><div><h2>Gastos da barbearia</h2><p class="section-subtitle">Registre despesas e retiradas. Compra de tinta não altera comissões.</p></div></div>
 <div class="filters-bar">
  <div class="form-group"><label for="gastos-inicio">De</label><input type="date" id="gastos-inicio"></div>
  <div class="form-group"><label for="gastos-fim">Até</label><input type="date" id="gastos-fim"></div>
  <div class="form-group"><label for="gastos-categoria">Categoria</label><select id="gastos-categoria"><option value="">Todas</option>${selectOptions(Object.fromEntries(categoriasGastoUI.map(x=>[x,x])))}</select></div>
  <button class="btn btn-primary" id="filtrar-gastos">Filtrar</button><button class="btn btn-outline" id="limpar-filtros-gastos">Todo o período</button><button class="btn btn-success" id="novo-gasto">Novo gasto</button>
 </div>
 <div class="kpi-grid" id="gastos-resumo"></div>
 <div class="table-responsive"><table id="table-gastos"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Pagamento</th><th>Observação</th><th>Ações</th></tr></thead><tbody></tbody></table></div>
</section>`);
document.querySelector('#historico-dono .period-chips').insertAdjacentHTML('afterend', `
<div class="filters-bar"><div class="form-group"><label for="hist-inicio">De</label><input type="date" id="hist-inicio"></div><div class="form-group"><label for="hist-fim">Até</label><input type="date" id="hist-fim"></div><button class="btn btn-primary" id="hist-filtrar">Filtrar</button><button class="btn btn-outline" id="hist-tudo">Todo o período</button></div>`);
document.body.insertAdjacentHTML('beforeend', `
<dialog id="dialog-gasto" class="owner-dialog" aria-labelledby="titulo-gasto"><form id="form-gasto">
 <h3 id="titulo-gasto">Novo gasto</h3><input type="hidden" id="gasto-id">
 <div class="form-grid-2"><div class="form-group"><label for="gasto-categoria">Categoria</label><select id="gasto-categoria">${selectOptions(Object.fromEntries(categoriasGastoUI.map(x=>[x,x])))}</select></div>
 <div class="form-group"><label for="gasto-data">Data</label><input type="date" id="gasto-data" required></div></div>
 <div class="form-group"><label for="gasto-descricao">Descrição</label><input id="gasto-descricao" maxlength="200" required></div>
 <div class="form-grid-2"><div class="form-group"><label for="gasto-valor">Valor (R$)</label><input type="number" id="gasto-valor" min="0.01" step="0.01" required></div>
 <div class="form-group"><label for="gasto-pagamento">Pagamento</label><select id="gasto-pagamento">${selectOptions(pagamentosUI)}</select></div></div>
 <div class="form-group"><label for="gasto-observacao">Observação</label><textarea id="gasto-observacao" maxlength="2000"></textarea></div>
 <div class="owner-actions"><button class="btn btn-success" type="submit">Salvar gasto</button><button class="btn btn-outline" type="button" data-fechar="dialog-gasto">Cancelar</button></div>
</form></dialog>
<dialog id="dialog-atendimento" class="owner-dialog" aria-labelledby="titulo-atendimento"><form id="form-edicao-atendimento">
 <h3 id="titulo-atendimento">Editar atendimento</h3><p id="edicao-profissional" class="owner-note"></p>
 <p class="owner-note">As comissões serão recalculadas com as taxas atuais. Uma cópia de segurança será criada antes de salvar.</p>
 <div id="edicao-itens"></div><div class="owner-actions"><button class="btn btn-outline" type="button" id="edicao-adicionar">Adicionar serviço</button></div>
 <div class="form-group"><label for="edicao-pagamento">Pagamento</label><select id="edicao-pagamento">${selectOptions(pagamentosUI)}</select></div>
 <div class="form-group"><label for="edicao-observacao">Observação</label><textarea id="edicao-observacao" maxlength="2000"></textarea></div>
 <p id="edicao-total" class="owner-note"></p>
 <div class="owner-actions"><button class="btn btn-success" type="submit">Salvar alterações</button><button class="btn btn-outline" type="button" data-fechar="dialog-atendimento">Cancelar</button></div>
</form></dialog>`);

async function ownerRequest(path, options={}) {
    const sessao=relatorioToken();
    if(!sessao) throw new Error('Entre na Área do Dono.');
    const response=await fetch(API_URL+path,{...options,headers:{'Content-Type':'application/json',...options.headers,'X-Relatorio-Token':sessao}});
    if(sessao!==relatorioToken()) throw new Error('A sessão foi encerrada.');
    if(response.status===401){removerTokenRelatorio();abrirModalSenhaRelatorio();throw new Error('Entre novamente na Área do Dono.');}
    if(!response.ok){const erro=await response.json().catch(()=>({}));throw new Error(erro.error || 'Não foi possível concluir a operação.');}
    return response;
}
async function ownerJson(path,options){return (await ownerRequest(path,options)).json();}
function periodoUI(inicio,fim) {
    const query=new URLSearchParams();
    if(inicio && fim && inicio>fim) throw new Error('A data inicial deve ser anterior à final.');
    if(inicio)query.set('data_inicio',dataInputParaUtcInicio(inicio));
    if(fim)query.set('data_fim',dataInputParaUtcFim(fim));
    return query;
}
function mensagemErro(error){showToast(error.message || 'Falha de comunicação. Confira os dados antes de tentar novamente.','error');}
function limparAreaDono() {
    sequenciaGastos++;gastosUI=[];servicosEdicaoUI=[];atendimentoEdicaoUI=null;
    for(const selector of ['#financeiro-extra','#gastos-resumo','#table-gastos tbody','#table-historico-dono tbody','#historico-dono-status','#edicao-itens']) document.querySelector(selector)?.replaceChildren();
    document.getElementById('historico-dono-status')?.classList.remove('success','error','loading');
    document.querySelectorAll('.owner-dialog').forEach(dialog=>{dialog.close();dialog.querySelector('form')?.reset();});
    for(const id of ['modal-editar-barbeiro','modal-editar-servico']) document.getElementById(id).style.display='none';
}
function renderFinanceiro(geral) {
    const container=document.getElementById('financeiro-extra');
    if(!container)return;
    const cards=[
        ['Receitas de serviços',geral.total_geral,'fa-scissors','gold'],
        ['Tinta cobrada',geral.total_tinta,'fa-droplet','blue'],
        ['Total recebido',geral.total_recebido,'fa-wallet','green'],
        ['Gastos totais',geral.total_gastos,'fa-arrow-trend-down','red'],
        ['Saldo operacional',geral.saldo_operacional,'fa-scale-balanced','gold']
    ];
    const pagamentos=Object.entries(pagamentosUI).map(([method,label])=>({
        method,label,total:(geral.pagamentos||[]).find(p=>p.metodo_pagamento===method)?.total || 0
    }));
    const categorias=geral.gastos_por_categoria||[];
    container.innerHTML=`
        <section class="financeiro-section">
            <div class="financeiro-section-heading"><div><h4>Resumo do período</h4><p>Valores consolidados dos atendimentos e despesas.</p></div></div>
            <div class="kpi-grid financeiro-kpis">${cards.map(([label,value,icon,tone])=>`<div class="kpi-card financeiro-kpi financeiro-kpi-${tone}"><div class="kpi-top"><span class="kpi-title">${escapeHtml(label)}</span><span class="financeiro-icon"><i class="fas ${icon}"></i></span></div><div class="kpi-value ${Number(value)<0?'owner-negative':''}">${moedaUI(value)}</div></div>`).join('')}</div>
        </section>
        <section class="financeiro-section financeiro-columns">
            <div class="custom-card financeiro-panel">
                <div class="financeiro-section-heading"><div><h4>Recebimentos por forma de pagamento</h4><p>Receita recebida antes das despesas.</p></div></div>
                <div class="pagamentos-grid">${pagamentos.map(p=>`<div class="pagamento-item"><span><i class="fas ${p.method==='pix'?'fa-qrcode':p.method==='cartao'?'fa-credit-card':'fa-money-bill-wave'}"></i>${escapeHtml(p.label)}</span><strong>${moedaUI(p.total)}</strong></div>`).join('')}</div>
            </div>
            <div class="custom-card financeiro-panel">
                <div class="financeiro-section-heading"><div><h4>Gastos por categoria</h4><p>Despesas registradas no mesmo período.</p></div></div>
                <div class="gastos-categoria-list">${categorias.length ? categorias.map(g=>`<div class="gasto-categoria-item"><span>${escapeHtml(g.categoria)}</span><strong>${moedaUI(g.total)}</strong></div>`).join('') : '<div class="financeiro-empty"><i class="fas fa-receipt"></i><span>Nenhum gasto no período.</span></div>'}</div>
            </div>
        </section>
        <p class="owner-note financeiro-note"><i class="fas fa-circle-info"></i> Saldo operacional = total recebido − gastos totais. As comissões são apresentadas separadamente na aba Equipe.</p>`;
}
async function loadGastos() {
    const seq=++sequenciaGastos;
    try {
        const query=periodoUI(document.getElementById('gastos-inicio').value,document.getElementById('gastos-fim').value);
        const cat=document.getElementById('gastos-categoria').value;if(cat)query.set('categoria',cat);
        const rows=await ownerJson('/gastos?'+query);
        if(seq!==sequenciaGastos || !relatorioToken())return;
        gastosUI=rows;
        document.getElementById('gastos-resumo').innerHTML='<div class="kpi-card"><div class="kpi-title">Gastos filtrados</div><div class="kpi-value">'+moedaUI(rows.reduce((sum,g)=>sum+g.valor,0))+'</div><div>'+rows.length+' lançamentos</div></div>';
        const tbody=document.querySelector('#table-gastos tbody');tbody.replaceChildren();
        if(!rows.length){tbody.innerHTML='<tr><td colspan="7">Nenhum gasto encontrado.</td></tr>';return;}
        for(const g of rows){
            const tr=document.createElement('tr');
            for(const value of [new Date(g.data_hora).toLocaleDateString('pt-BR'),g.categoria,g.descricao,moedaUI(g.valor),pagamentosUI[g.metodo_pagamento]||g.metodo_pagamento,g.observacao||'—']){
                const td=document.createElement('td');td.textContent=value;tr.append(td);
            }
            const td=document.createElement('td');
            for(const [label,action] of [['Editar',()=>abrirGasto(g)],['Excluir',()=>excluirGasto(g)]]){
                const b=document.createElement('button');b.textContent=label;b.className='btn btn-small '+(label==='Excluir'?'btn-danger':'btn-outline');b.onclick=action;td.append(b);
            }
            tr.append(td);tbody.append(tr);
        }
    } catch(error){mensagemErro(error);}
}
function abrirGasto(g={}) {
    if(!relatorioToken())return;
    document.getElementById('form-gasto').reset();
    document.getElementById('titulo-gasto').textContent=g.id?'Editar gasto #'+g.id:'Novo gasto';
    for(const [id,value] of Object.entries({'gasto-id':g.id||'','gasto-categoria':g.categoria||'outros','gasto-data':dataLocalISO(g.data_hora?new Date(g.data_hora):new Date()),'gasto-descricao':g.descricao||'','gasto-valor':g.valor||'','gasto-pagamento':g.metodo_pagamento||'dinheiro','gasto-observacao':g.observacao||''}))document.getElementById(id).value=value;
    document.getElementById('dialog-gasto').showModal();
}
async function excluirGasto(g) {
    if(!confirm('Excluir o gasto "'+g.descricao+'" de '+moedaUI(g.valor)+'? O saldo será atualizado.'))return;
    try{await ownerJson('/gastos/'+g.id,{method:'DELETE'});showToast('Gasto excluído.','success');await loadGastos();await loadRelatorio();}catch(error){mensagemErro(error);}
}
document.getElementById('form-gasto').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;if(button.disabled)return;
    const id=document.getElementById('gasto-id').value;
    if(id && !confirm('Salvar as alterações deste gasto e atualizar o saldo?'))return;
    const old=gastosUI.find(g=>g.id===Number(id));
    const data=document.getElementById('gasto-data').value;
    const body={categoria:document.getElementById('gasto-categoria').value,descricao:document.getElementById('gasto-descricao').value,valor:document.getElementById('gasto-valor').value,metodo_pagamento:document.getElementById('gasto-pagamento').value,data_hora:old && dataLocalISO(new Date(old.data_hora))===data?old.data_hora:dataInputParaUtcInicio(data),observacao:document.getElementById('gasto-observacao').value};
    button.disabled=true;
    try{await ownerJson('/gastos'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(body)});document.getElementById('dialog-gasto').close();showToast('Gasto salvo.','success');await loadGastos();await loadRelatorio();}catch(error){mensagemErro(error);}finally{button.disabled=false;}
});

async function abrirEdicaoAtendimento(a) {
    try {
        const response=await fetch(API_URL+'/servicos');if(!response.ok)throw new Error('Não foi possível carregar os serviços.');
        const services=await response.json();if(!relatorioToken())return;
        atendimentoEdicaoUI=a;
        servicosEdicaoUI=services.filter(s=>a.barbeiro_is_dono || !s.apenas_dono);
        for(const item of a.itens)if(!servicosEdicaoUI.some(s=>s.id===item.servico_id))servicosEdicaoUI.push({id:item.servico_id,nome:item.servico_nome+' (histórico)',valor:item.valor_cobrado});
        document.getElementById('titulo-atendimento').textContent='Editar atendimento #'+a.id;
        document.getElementById('edicao-profissional').textContent=a.barbeiro_nome+' • '+new Date(a.data_hora).toLocaleString('pt-BR');
        document.getElementById('edicao-pagamento').value=a.metodo_pagamento||'dinheiro';
        document.getElementById('edicao-observacao').value=a.observacao||'';
        document.getElementById('edicao-itens').replaceChildren();
        a.itens.forEach(adicionarLinhaEdicao);
        atualizarTotalEdicao();document.getElementById('dialog-atendimento').showModal();
    }catch(error){mensagemErro(error);}
}
function adicionarLinhaEdicao(item=null) {
    const used=[...document.querySelectorAll('[data-edit-servico]')].map(s=>Number(s.value));
    const service=item?servicosEdicaoUI.find(s=>s.id===item.servico_id):servicosEdicaoUI.find(s=>!used.includes(s.id));
    if(!service){showToast('Todos os serviços disponíveis já foram adicionados.','error');return;}
    const row=document.createElement('div');row.className='owner-item';row.dataset.pigmentacao=item?.tem_pigmentacao || 0;
    row.innerHTML='<label>Serviço<select data-edit-servico aria-label="Serviço">'+selectOptions(Object.fromEntries(servicosEdicaoUI.map(s=>[s.id,s.nome])),service.id)+'</select></label><label>Valor (R$)<input aria-label="Valor do serviço" type="number" data-edit-valor min="0" step="0.01" required></label><label>Tinta (R$)<input aria-label="Valor da tinta" type="number" data-edit-tinta min="0" step="0.01" required></label><button type="button" class="btn btn-danger btn-small">Remover</button>';
    row.querySelector('[data-edit-valor]').value=item?item.valor_cobrado:service.valor;
    row.querySelector('[data-edit-tinta]').value=item?.valor_tinta || 0;
    row.querySelector('select').addEventListener('change',event=>{row.querySelector('[data-edit-valor]').value=servicosEdicaoUI.find(s=>s.id===Number(event.target.value)).valor;atualizarTotalEdicao();});
    row.querySelector('button').onclick=()=>{row.remove();atualizarTotalEdicao();};
    row.addEventListener('input',atualizarTotalEdicao);
    document.getElementById('edicao-itens').append(row);
}
function atualizarTotalEdicao(){const total=[...document.querySelectorAll('#edicao-itens input')].reduce((sum,i)=>sum+Number(i.value||0),0);document.getElementById('edicao-total').textContent='Total cobrado: '+moedaUI(total);}
document.getElementById('edicao-adicionar').onclick=()=>{adicionarLinhaEdicao();atualizarTotalEdicao();};
document.getElementById('form-edicao-atendimento').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;if(button.disabled)return;
    const itens=[...document.querySelectorAll('#edicao-itens .owner-item')].map(row=>({servico_id:Number(row.querySelector('select').value),valor_cobrado:row.querySelector('[data-edit-valor]').value,valor_tinta:row.querySelector('[data-edit-tinta]').value,tem_pigmentacao:Number(row.dataset.pigmentacao)}));
    if(!itens.length){showToast('Mantenha pelo menos um serviço.','error');return;}
    if(new Set(itens.map(i=>i.servico_id)).size!==itens.length){showToast('O mesmo serviço não pode aparecer duas vezes.','error');return;}
    if(!confirm('Salvar as alterações do atendimento #'+atendimentoEdicaoUI.id+'? As comissões e os relatórios serão recalculados. Será criado um backup antes da alteração.'))return;
    button.disabled=true;
    try{
        await ownerJson('/atendimentos/'+atendimentoEdicaoUI.id,{method:'PUT',body:JSON.stringify({itens,metodo_pagamento:document.getElementById('edicao-pagamento').value,observacao:document.getElementById('edicao-observacao').value})});
        document.getElementById('dialog-atendimento').close();showToast('Atendimento atualizado. Backup criado.','success');
        await Promise.all([loadHistoricoDono(),loadHistorico(),loadRelatorio()]);
    }catch(error){mensagemErro(error);}finally{button.disabled=false;}
});
document.getElementById('novo-gasto').onclick=()=>abrirGasto();
document.getElementById('filtrar-gastos').onclick=loadGastos;
document.getElementById('limpar-filtros-gastos').onclick=()=>{for(const id of ['gastos-inicio','gastos-fim','gastos-categoria'])document.getElementById(id).value='';loadGastos();};
document.querySelectorAll('[data-fechar]').forEach(button=>button.onclick=()=>document.getElementById(button.dataset.fechar).close());
document.getElementById('hist-filtrar').onclick=()=>{
    try{const q=periodoUI(document.getElementById('hist-inicio').value,document.getElementById('hist-fim').value);histDonoInicio=q.get('data_inicio')||'';histDonoFim=q.get('data_fim')||'';histDonoPeriodo='personalizado';loadHistoricoDono();}catch(error){mensagemErro(error);}
};
document.getElementById('hist-tudo').onclick=()=>{histDonoInicio='';histDonoFim='';histDonoPeriodo='tudo';document.getElementById('hist-inicio').value='';document.getElementById('hist-fim').value='';loadHistoricoDono();};
atualizarUIacessoDono();
if(relatorioToken() && ['gastos'].includes(localStorage.getItem('activeTab')))showTab(localStorage.getItem('activeTab'),false);

function dataLocalISO(date) { return date.toISOString().slice(0, 10); }
