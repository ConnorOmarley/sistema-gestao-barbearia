function renderPagination(id,anchor,data,load) {
  renderPaginacaoNumerada({
    id,
    anchor,
    pagina: data.pagina,
    paginas: data.paginas,
    total: data.total,
    rotuloTotal: data.total === 1 ? 'registro' : 'registros',
    aoIrPara: load
  });
}
(function(){
  const style=document.createElement('style');style.textContent='.historico-pagination{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin:18px 0}.historico-pagination .page-num{min-width:34px}.historico-pagination .page-num.current{background:var(--gold-primary);border-color:var(--gold-primary);color:#0d1017;font-weight:700}.historico-pagination .page-ellipsis{color:var(--text-muted);padding:2px 0}.historico-pagination .page-jump{width:64px;padding:6px 8px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-card);color:var(--text);font:inherit}.backup-status{white-space:pre-line;overflow-wrap:anywhere}.backup-list{max-height:280px;overflow:auto}.backup-list button{display:block;margin:8px 0}';document.head.append(style);
  document.querySelector('.rel-subtabs').insertAdjacentHTML('beforeend','<button type="button" class="rel-subtab" data-subtab="backups" id="abrir-backups"><i class="fas fa-shield-halved"></i> Backups</button>');
  document.getElementById('relatorio').insertAdjacentHTML('beforeend',`<div class="rel-subaba" id="rel-sub-backups" data-tab="backups" style="display:none"><section class="custom-card">
    <h3>Cópias de segurança</h3><p class="owner-note">Mantemos 20 cópias recentes, 30 diárias e 12 mensais. As cópias diárias e mensais são atualizadas durante o uso. Os backups incluem registros e configurações; fotos devem ser copiadas junto com a pasta do sistema.</p>
    <p class="backup-status" id="backup-status" role="status"></p>
    <form id="backup-form"><div class="form-group"><label for="backup-folder">Pasta para uma cópia adicional</label><input id="backup-folder" type="text" placeholder="Ex.: E:\\Backups" autocomplete="off"><small>Escolha uma pasta existente em outro dispositivo ou sincronizada com a nuvem. Cada instalação recebe sua própria subpasta. Deixe vazio para desativar.</small></div><button class="btn btn-primary" type="submit">Salvar destino</button></form>
    <p class="owner-note">Uma pasta no mesmo disco não protege contra defeito ou perda desse disco. Se o destino ficar desconectado, o sistema avisará e tentará novamente a cada cinco minutos.</p>
    <button type="button" class="btn btn-outline" id="backup-now">Criar cópia agora</button>
    <h4 style="margin-top:20px">Baixar uma cópia local</h4><div id="backup-list" class="backup-list"></div>
    <p class="owner-note">Para restaurar, encerre o sistema e peça ao responsável técnico para validar a cópia e substituir o banco. Não copie o banco sobre o sistema em funcionamento.</p>
  </section></div>`);
  const status=document.getElementById('backup-status'),folder=document.getElementById('backup-folder');
  let generation=0;
  function show(s){
    const date=v=>v?new Date(v).toLocaleString('pt-BR'):'Ainda não realizada nesta sessão';
    status.textContent='Última cópia local: '+date(s.ultimo_local)+'\n'+(s.pasta_externa?'Última cópia adicional: '+date(s.ultimo_externo):'Cópia em outro local ainda não configurada.')+(s.erro_local?'\nFalha na cópia local: '+s.erro_local:'')+(s.erro_externo?'\nCópia adicional pendente: '+s.erro_externo:'');
    status.classList.toggle('owner-negative',!!(s.erro_local||s.erro_externo));
    document.getElementById('abrir-backups').textContent=s.erro_local||s.erro_externo?'Backups · verificar':'Backups';
  }
  async function refresh(list=false){
    const gen=++generation,session=relatorioToken();if(!session)return;
    try{
      const s=await ownerJson('/backup/status');if(gen!==generation||session!==relatorioToken())return;show(s);
      if(list){folder.value=s.pasta_externa;const files=await ownerJson('/backup');if(gen!==generation||session!==relatorioToken())return;
        const el=document.getElementById('backup-list');el.replaceChildren();
        for(const file of files){const b=document.createElement('button');b.type='button';b.className='btn btn-outline btn-small';b.textContent=file;
          b.onclick=async()=>{b.disabled=true;try{const response=await ownerRequest('/backup?arquivo='+encodeURIComponent(file)),blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){mensagemErro(e);}finally{b.disabled=false;}};el.append(b);}
      }
    }catch(e){if(gen===generation&&session===relatorioToken())status.textContent=e.message;}
  }
  document.getElementById('abrir-backups').onclick=()=>{mostrarSubAbaRelatorio('backups');refresh(true);};
  document.getElementById('backup-form').onsubmit=async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{const s=await ownerJson('/backup/configuracao',{method:'PUT',body:JSON.stringify({pasta:folder.value})});show(s);showToast(s.erro_externo?'Destino salvo, mas a cópia falhou. Confira o aviso.':'Destino salvo.',s.erro_externo?'error':'success');}catch(e){mensagemErro(e);}finally{b.disabled=false;}};
  document.getElementById('backup-now').onclick=async event=>{const b=event.currentTarget;b.disabled=true;try{await ownerJson('/backup',{method:'POST',body:'{}'});await refresh(true);}catch(e){mensagemErro(e);}finally{b.disabled=false;}};
  const oldClear=limparAreaDono;
  limparAreaDono=function(){generation++;status.textContent='';folder.value='';document.getElementById('backup-list').replaceChildren();for(const id of ['historico-paginas','gastos-paginas','extrato-paginas'])document.getElementById(id)?.remove();oldClear();};
  setInterval(()=>{if(relatorioToken())refresh();},60000);
  if(relatorioToken())refresh();
})();
