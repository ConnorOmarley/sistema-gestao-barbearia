# Correções de 18/09/2026

## Atendimento e cadastros

- Formato antigo com serviço único soma a tinta somente uma vez.
- Serviços repetidos são recusados pela API e pelo banco para novos lançamentos.
- Valores devem ser finitos e não negativos; percentuais ficam entre 0 e 100.
- Valores monetários usam centavos, com comissão arredondada por item.
- Cadastro e edição distinguem zero de campo ausente.
- Editar só nome/preço preserva a comissão fixa do serviço.
- Novos atendimentos exigem barbeiro e serviços ativos.
- Pigmentação e nomes começando com “pintar” sempre têm comissão 0% e ficam restritos ao dono.
- A migração corrige também serviços antigos que já tinham percentual fixo.
- Dono recebe 100% do serviço e tinta; colaboradores não recebem comissão sobre tinta.

## Histórico, relatórios e acesso

- O caixa consulta somente atendimentos do dia, sem campos de comissão no histórico.
- Exclusão individual do dia continua disponível no caixa, com confirmação.
- Exclusão de dias anteriores exige acesso do dono.
- Exclusão remove os itens em cascata e os valores dos relatórios.
- Relatórios incluem colaboradores inativos que tenham atendimentos no período.
- Faturamento exibido inclui tinta; a tinta também aparece separadamente no detalhamento.
- Comissões dos colaboradores e remuneração do dono são separadas.
- “Parte da barbearia” é a receita menos comissões, antes de despesas.
- “Total destinado ao dono” soma seus atendimentos próprios à parte da barbearia.
- Backup, download e limpeza completa exigem token do dono no cabeçalho X-Relatorio-Token.
- Limpeza completa exige confirmação textual APAGAR TODOS e cria backup antes de apagar.
- Sair da Área do Dono revoga o token no servidor e limpa os relatórios da tela.
- Textos de cadastros/observações são escapados na interface; apóstrofos não quebram edição.
- Operações recusadas não exibem mensagem de sucesso.

## Persistência e operação portátil

- Atendimento e itens são gravados em transação única.
- Gravação usa arquivo temporário, sincronização em disco e substituição do arquivo final.
- Falha na persistência reverte a alteração em memória.
- Integridade referencial permanece habilitada após exportar o banco sql.js.
- Migração completa itens faltantes por atendimento.
- Migração preserva IDs, valores históricos e duplicatas antigas; não recalcula comissões passadas.
- Antes da primeira migração, uma cópia exata do banco é criada em backend/barbearia-antes-migracao-v2-*.db. Essa cópia não entra na rotação dos 20 backups.
- Gravação periódica continua a cada 5 segundos e backup a cada 5 minutos, mantendo 20 cópias.
- Fotos continuam em frontend/assets/perfil: copiar só barbearia.db não inclui fotos.
- O iniciador aguarda o servidor e permite encerramento salvando por ENTER.
- O instalador adiciona o Node/npm portátil ao PATH e respeita erros de instalação.

## Verificação

Execute com o Node portátil:

    bin\node.exe tests\regression.mjs

A suíte cria bancos fictícios em backend/.testdata. Não utiliza o banco de produção.
Testa migração, fórmulas, validação, histórico, exclusão, autorização, logout,
reinício, integridade, rollback, falha de escrita e retenção dos backups.

Depois de atualizar os arquivos, encerre a instância anterior e abra novamente
iniciar_sistema.bat. Atualizar apenas a página não recarrega o backend.

Registros antigos incorretos não foram apagados nem recalculados automaticamente.
O backup anterior à migração permite comparar o estado antigo caso seja necessário
revisar lançamentos históricos individualmente.
