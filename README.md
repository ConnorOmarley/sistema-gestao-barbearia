# 💈 Sistema de Gestão para Barbearia

Sistema completo de gestão e caixa para barbearias. 100% **offline**, roda direto de um **pen drive** sem instalar nada.

> Projeto desenvolvido sob medida para a barbearia Michael Barber — funciona em qualquer computador com Windows, sem internet e sem mensalidade.

---

## ✨ Funcionalidades

- 💈 **Caixa & Atendimento** — registro de serviços com cálculo automático de comissão por barbeiro
- 🎨 **Pigmentação** — qualquer barbeiro pode fazer, mas o lucro da tinta vai 100% para o dono (não comissionado)
- 📊 **Relatórios financeiros** — comissões e faturamento por período, protegidos por senha (Área do Dono)
- 👑 **Área do Dono** — aba de relatórios oculta no menu; aparece apenas após autenticação com senha
- ✂️ **Gestão de serviços** — cadastro, edição e serviços exclusivos do dono
- 👤 **Gestão de barbeiros** — cadastro e percentual de comissão individual
- 🕓 **Histórico** — atendimentos com filtros por período

---

## 🛠️ Stack

| Camada       | Tecnologia                    |
| ------------ | ----------------------------- |
| Frontend     | HTML + CSS + JavaScript puro  |
| Backend      | Node.js + Express             |
| Banco        | SQLite (sql.js)               |
| Portabilidade| Node.js runtime embutido (`bin/`) |

---

## 🚀 Como usar

### Modo portátil (pen drive)

1. Coloque a pasta do sistema no pen drive
2. Conecte em qualquer PC Windows
3. Duplo clique em **`iniciar_sistema.bat`**
4. O sistema abre automaticamente no navegador em `http://localhost:3000`

> O `bin/node.exe` embutido permite rodar mesmo em PCs sem Node.js instalado.

### Modo desenvolvimento

```bash
cd backend
npm install
npm start
```

---

## 🔒 Área do Dono (proteção de relatórios)

- O menu **não exibe** a aba de relatórios para os barbeiros
- Clicando em **"Área do Dono"** no cabeçalho, o dono define uma senha no primeiro acesso
- Com a senha validada, a aba **Relatórios Financeiros** aparece no menu
- Senha armazenada com hash (SHA-256 + salt); sessão via token em memória

---

## 📁 Estrutura do projeto

```
sistema-gestao-barbearia/
├── iniciar_sistema.bat        # Início portátil (pen drive)
├── backend/
│   ├── server.js              # API REST (Express)
│   ├── database.js            # Banco SQLite (sql.js)
│   └── barbearia.db           # Banco criado automaticamente
├── frontend/
│   └── index.html             # Interface web completa
└── bin/
    └── node.exe               # Node.js portátil embutido
```

---

## 🔌 API Endpoints

| Método | Rota | Descrição |
| ------ | ---- | --------- | 
| GET/POST | `/api/barbeiros` | Listar / adicionar barbeiros |
| GET/POST | `/api/servicos` | Listar / adicionar serviços |
| POST | `/api/atendimentos` | Registrar atendimento (com cálculo de comissão) |
| GET | `/api/atendimentos` | Listar atendimentos (filtros por período) |
| GET | `/api/relatorio/comissoes` | Relatório de comissões por barbeiro *🔒 protegida* |
| GET | `/api/relatorio/geral` | Relatório geral do período *🔒 protegida* |
| POST | `/api/relatorio/login` | Login da Área do Dono |
| POST | `/api/relatorio/configurar-senha` | Definir senha do dono (primeiro acesso) |
| GET | `/api/relatorio/status` | Status da senha (configurada ou não) |

---

## 🧮 Lógica de comissão

```
valor_comissao = (valor_cobrado * comissao_percentual) / 100

Regras:
- Cada barbeiro tem seu percentual (ex: dono 50%)
- Pigmentação: o lucro da tinta vai inteiro para o dono
- Serviços podem ser marcados como exclusivos do dono
```

---

## 📝 Licença

MIT