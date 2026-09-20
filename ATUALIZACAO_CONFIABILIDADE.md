# Atualização de confiabilidade

## O que mudou

- Gravação imediata das operações confirmadas, sem regravar o banco a cada cinco segundos quando está parado. O mecanismo continua sendo sql.js: cada alteração ainda grava um arquivo completo. Não houve troca de banco nem envio de dados a servidores.
- Menos cópias completas do banco em memória durante as transações.
- Cálculo de comissões e contas pendentes com agregação no banco, evitando carregar todos os atendimentos antigos na tela de caixa.
- Histórico do dono, gastos e extrato em páginas de 50. Os totais continuam considerando o período inteiro; o extrato permite acessar movimentos além dos primeiros 200.
- Backups locais: 20 recentes, 30 diários e 12 mensais. Diário/mensal guarda a última cópia de cada dia/mês com uso, não todas as versões do dia. Ao atingir o limite, as cópias mais antigas daquela categoria são removidas.
- Cópia adicional configurável na Área do Dono > Relatórios Financeiros > Backups. Destino desconectado gera aviso e nova tentativa a cada cinco minutos, sem impedir vendas locais.
- Verificação estrutural do banco na abertura e ferramenta de verificação de cópias.

## Atualizar uma barbearia que já usa o sistema

1. Encerre pelo iniciador (ENTER) e aguarde o servidor fechar.
2. Copie a pasta completa da instalação para um local seguro antes da atualização.
3. Substitua apenas os arquivos de código fornecidos na atualização. Preserve `backend/barbearia.db`, `backend/backups`, os backups anteriores à migração e `frontend/assets/perfil`.
4. Abra o sistema e recarregue a página. Confira os registros e saldos anteriores.
5. Na Área do Dono, abra Backups e configure uma pasta existente em outro dispositivo ou uma pasta sincronizada. Clique em Criar cópia agora e confira o resultado.

A atualização não altera a senha nem limpa atendimentos. Não substitua uma instalação existente por uma pasta contendo o banco de outra barbearia.

## Novas barbearias

Prepare cada instalação sem banco, cópias anteriores ou fotos de outro cliente. No primeiro uso, o banco e a identificação da instalação são gerados; o dono configura a própria senha. Configure o nome e a identidade visual da barbearia antes da entrega: esta atualização mantém a identidade existente do projeto.

O destino adicional recebe uma subpasta própria para cada instalação. Clonar uma instalação já inicializada também clona essa identificação: para um cliente novo, distribua uma cópia limpa, sem banco. Não reutilize bancos entre clientes.

## Backups e limites

As cópias automáticas ocorrem ao iniciar e a cada cinco minutos enquanto o servidor está aberto, além das cópias antes de operações protegidas. Em até cinco minutos, uma alteração confirmada entra no backup automático; ela já está salva no banco principal imediatamente após a confirmação.

O destino adicional mantém 30 cópias diárias e 12 mensais. A aplicação confirma a gravação na pasta escolhida; não confirma que um serviço de nuvem terminou de sincronizar. Uma pasta no mesmo disco não protege contra perda desse disco.

Os arquivos `.db` incluem registros financeiros e configurações, inclusive dados de autenticação. Guarde-os em um local com acesso restrito. Fotos ficam fora do banco: copie também `frontend/assets/perfil`, ou faça uma cópia da pasta inteira para recuperação completa.

Sem atividade anterior, o histórico de 30 dias/12 meses será formado ao longo do uso. A retenção usa a data local do computador; mantenha seu relógio correto. Avisos aparecem na aba Backups durante a sessão do dono.

## Restaurar com suporte técnico

1. Encerre todas as instâncias do sistema. Preserve a pasta atual inteira, mesmo se houver suspeita de falha.
2. Escolha uma cópia da barbearia correta, anterior ao problema, e valide sem alterar arquivos:

   `bin\node.exe backend\verificar-backup.js "caminho-completo-da-copia.db"`

   Se usar Node instalado, substitua `bin\node.exe` por `node`.
3. Se a validação falhar, não substitua o banco. Analise outra cópia.
4. Preserve o banco atual com outro nome fora da pasta ativa e copie a cópia validada como `backend/barbearia.db`.
5. Abra o sistema e confira atendimentos, gastos, comissões e saldo. A validação estrutural não garante que a cópia escolhida contém todos os registros desejados. Operações feitas depois da cópia não estarão nela.

## Validação desta versão

51 grupos automatizados: 32 de regressão, 13 financeiros e 6 de resiliência. Incluem falha de gravação, rollback, reinício, retenção, destino indisponível/reconexão, ausência de regravação ociosa e paginação com totais.

Simulação com até 150 mil atendimentos e comissões quitadas: cálculo do caixa em aproximadamente 354–362 ms neste computador (antes: 609–622 ms). O resultado depende do equipamento e dos dados; não representa teste contínuo por anos ou homologação de uso simultâneo em vários computadores.
