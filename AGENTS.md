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

## Organização do repositório

Três lugares distintos, não misturar:

1. **Versionado no git (fonte da verdade = código)** — todo sys code e docs:
   - `backend/` (código, sem banco/backups/node_modules), `frontend/` (código e assets de interface, sem fotos).
   - `frontend/assets/fontawesome`, `assets/fonts`, `assets/logo.png` (recursos usados pelo app).
   - `scripts/` (empacotador de atualização e gerador de demonstração), `tests/`, `ferramentas-suporte/`.
   - Documentos e scripts de instalação na raiz: `*.bat`, `instalar-node.ps1`, `README.md`, `COMO_USAR.txt`, `LEIA_PRIMEIRO.txt`, `GUIA_SUPORTE.md`, `ATUALIZACAO_CONFIABILIDADE.md`, `CORRECOES.md`, `apresentacao/`, `AGENTS.md`, `.gitignore`.

2. **Só no ambiente de desenvolvimento/teste local (nunca commitar)** — dados e cópias do Carlos:
   - `backend/barbearia.db` (banco com dados reais e/ou demonstração), `backend/backups/` e `suporte/backups/` (cópias de segurança), `backend/suporte-manutencao.json`.
   - `frontend/assets/perfil/` (fotos reais dos barbeiros), `backend/node_modules/`, `bin/` (node portátil gerado), `backend/.testdata/`, `*.log`, `*.zip`, `.DS_Store`.

3. **Entrega ao cliente (pasta `ENTREGA/`) — fora do git de propósito**:
   - A raiz de `ENTREGA/` é a **instalação completa** (bin + backend + frontend + ferramentas + `.bat`/docs) para copiar ao pen drive.
   - `ENTREGA/atualizacao-assistida/<data>/` é o **pacote de atualização incremental** (só código + `manifesto.json` + `LEIA_PRIMEIRO.txt`); o conteúdo da pasta é compactado em `ATUALIZACAO_ASSISTIDA.zip` para enviar ao cliente.
   - `ENTREGA/` está no `.gitignore`; o pacote gerado e o ZIP **não vão para o git** (a fonte do que vai neles é o git; a entrega em si é fora).

Ao finalizar uma alteração: commit do código (git) + pacote novo em `ENTREGA/atualizacao-assistida/<data>` (fora do git) + avisar que a pasta está pronta para compactar em `ATUALIZACAO_ASSISTIDA.zip`.