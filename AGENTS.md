# AGENTS.md

## Projeto

Sistema de gestão para barbearia (comissões, atendimentos, financeiro), 100% offline (pen drive), backend Node.js + sql.js em `backend/`, frontend HTML/CSS/JS puro em `frontend/` (sem framework, sem CDN). Comunicar em português (pt-BR), commits sem acentos.

## Comandos de verificação

- Testes: `npm test` em `backend/` (regression, finance, resilience, suporte).
- Suporte/atualização apenas: `node tests/suporte.cjs`.

## Fluxo ao alterar arquivos do sistema

Sempre que mudar código do sistema (backend/frontend), além de validar e commitar:

1. Validar com os testes (pelo menos `node tests/suporte.cjs`).
2. Regenerar o pacote de atualização do cliente:
   `node scripts/empacotar-suporte.cjs "ENTREGA\atualizacao-assistida\<data-literal>"`
   (a pasta de saída não pode existir; usar data como "2026-09-22").
3. Avisar o usuário que a pasta está pronta para compactar em `ATUALIZACAO_ASSISTIDA.zip`.

O empacotador exige `LEIA_PRIMEIRO.txt` na raiz; não apagar.

Depósito: `ENTREGA/` fica no `.gitignore`; o pacote gerado (e o ZIP) não vão para o git.