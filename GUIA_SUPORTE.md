# Suporte ao primeiro cliente

## Como entregar esta atualização

Envie **ATUALIZACAO_ASSISTIDA.zip**, não a pasta ENTREGA nem um banco de teste.
O cliente deve extrair o ZIP inteiro, fechar o sistema, executar `ATUALIZAR_SISTEMA.bat` e escolher a pasta onde fica o `iniciar_sistema.bat` que ele já usa. Os arquivos são aplicados automaticamente. Ao terminar, ele abre o sistema e recarrega a página com Ctrl+F5.

O pacote inclui os reforços de confiabilidade anteriores e as ferramentas de suporte. Pode atualizar a versão anterior àqueles reforços, desde que use as mesmas dependências deste projeto. Não exige instalar pacotes nem acessar a internet. O computador deve ter o Node portátil da instalação ou Node já instalado.

## O que o atualizador faz

1. Valida a estrutura do pacote, os hashes e a sintaxe dos arquivos JavaScript.
2. Exige o sistema fechado. A porta usada pelo sistema fica reservada durante a manutenção, impedindo a abertura pelo iniciador normal.
3. Guarda os arquivos que serão substituídos e uma cópia do banco em `suporte/backups`, dentro da instalação.
4. Substitui apenas os arquivos de código permitidos. Não troca banco, senha, fotos nem backups financeiros.
5. Confere os arquivos gravados. Em caso de falha, tenta recuperar automaticamente os originais.

O atualizador não inicia o servidor nem faz migrações para testar. A primeira abertura depois da atualização executa as migrações normais do sistema; confira a abertura e os saldos com o cliente. Não há download automático de versões. Os hashes detectam pacote incompleto ou alterado, mas não são assinatura digital: distribua somente o ZIP produzido por você.

## Se houver interrupção

Peça que o cliente mantenha o sistema fechado e execute `RECUPERAR_ATUALIZACAO.bat`. O arquivo existe no ZIP extraído e, depois da atualização, na instalação. Se algum arquivo dessa ferramenta estiver incompleto na instalação, use a cópia do ZIP.

A ferramenta usa o registro da manutenção pendente e confere os originais antes de reverter. Não apague `backend/suporte-manutencao.json` manualmente nem remova as pastas de recuperação. Se a cópia dos originais estiver danificada, a ferramenta interrompe a recuperação e pede suporte.

Uma atualização que já terminou com sucesso não é desfeita por esse botão. Para problemas percebidos depois da conclusão, analise a pasta da cópia anterior e oriente a recuperação; não substitua dados automaticamente, pois podem existir vendas posteriores.

## Restaurar dados com orientação

1. Encerre o sistema.
2. Abra `RESTAURAR_BACKUP.bat` na instalação.
3. Escolha o arquivo `.db`. A ferramenta verifica a estrutura e mostra o dono cadastrado, o número de atendimentos e o último atendimento.
4. Confira com o cliente que a cópia é da barbearia correta e confirme a restauração.

O banco atual é guardado antes da troca. Os registros e a senha voltam ao estado da cópia escolhida; dados posteriores deixam de aparecer. Fotos ficam fora do banco. A ferramenta bloqueia identificação de instalação diferente quando essa identificação existe nos dois bancos; cópias antigas podem não conter identificação, por isso a conferência humana continua necessária.

Depois, abra o sistema, confira os saldos e verifique o destino do backup adicional, que também pode ter voltado ao valor da cópia. Para desfazer uma restauração já concluída, use o banco guardado em `suporte/backups/<identificador>/originais/backend/barbearia.db`, após verificar se houve novos lançamentos.

## Registro e armazenamento

Cada manutenção guarda um `registro.json` com data, operação, arquivos, hashes e resultado. A cópia anterior fica na mesma pasta. Essas cópias de manutenção não têm exclusão automática; revise o espaço com o cliente e só remova cópias antigas quando houver outra cópia segura. Elas não substituem o backup em outro dispositivo.

Para suporte, peça primeiro a mensagem de erro, o caminho da instalação e o registro da manutenção. O banco contém informações do cliente e só deve ser compartilhado quando necessário e autorizado.

## Validação

Testes automatizados de atualização, preservação do banco, retorno após falha, recuperação após encerramento abrupto, pacote adulterado, caminhos inválidos, sintaxe inválida, sistema aberto, restauração, cópia de outra instalação e banco corrompido. As suítes de regressão, financeiro e resiliência também são executadas. Os testes não simulam todas as falhas físicas de disco ou de energia.
