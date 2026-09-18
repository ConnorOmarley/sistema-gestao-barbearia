function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}
function safePhoto(value) {
    return typeof value === 'string' && /^assets\/perfil\/barbeiro_\d+(?:_\d+)?\.(png|jpeg|jpg|webp|gif)$/.test(value) ? value : 'assets/logo.png';
}
function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function editBarbeiroPorId(id) {
    const b = cachedBarbeiros.find(b => b.id === id);
    if (b) editBarbeiro(b.id, b.nome, b.is_dono ? 100 : b.comissao_percentual);
}
function editServicoPorId(id) {
    const s = cachedServicos.find(s => s.id === id);
    if (s) editServico(s.id, s.nome, s.valor, s.apenas_dono, s.comissao_fixa_pct);
}
async function salvarAlteracao(url, options) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(data.error || 'Não foi possível salvar a alteração.', 'error');
            return false;
        }
        return true;
    } catch {
        showToast('Falha de comunicação. Confira os dados antes de tentar novamente.', 'error');
        return false;
    }
}
