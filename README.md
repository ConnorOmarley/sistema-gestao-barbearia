# Sistema de Gestão para Barbearia

Sistema web para gerenciar atendimentos e calcular comissões de barbeiros.

## Funcionalidades

- 💈 Cadastro de barbeiros com comissão personalizável por profissional
- ✂️ Cadastro de serviços (corte, barba, pintar cabelo, etc.)
- 📝 Registro de atendimentos (barbeiro + serviço + valor cobrado)
- 💰 Relatório de comissões por período
- 🔒 Validação: serviços exclusivos do dono (ex: pintar cabelo)
- 📊 Histórico completo de atendimentos

## Tecnologias

- **Backend:** Node.js + Express
- **Banco de dados:** SQLite (sql.js)
- **Frontend:** HTML + CSS + JavaScript (Vanilla)

## Como usar

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Iniciar o servidor

```bash
npm start
```

O servidor estará rodando em `http://localhost:3000`

### 3. Abrir a interface

Abra o arquivo `frontend/index.html` no navegador.

## Dados iniciais

O sistema já vem com:
- **Dono** cadastrado (100% de comissão)
- **Pintar Cabelo** como serviço exclusivo do dono (R$ 80,00)

## Estrutura do projeto

```
barbearia-sistema/
├── backend/
│   ├── server.js          # API REST
│   ├── database.js        # Configuração do banco SQLite
│   ├── package.json
│   └── barbearia.db       # Banco de dados (criado automaticamente)
└── frontend/
    └── index.html         # Interface web completa
```

## API Endpoints

- `GET /api/barbeiros` - Lista barbeiros
- `POST /api/barbeiros` - Adiciona barbeiro
- `GET /api/servicos` - Lista serviços
- `POST /api/servicos` - Adiciona serviço
- `POST /api/atendimentos` - Registra atendimento
- `GET /api/atendimentos` - Lista atendimentos (com filtros de data)
- `GET /api/relatorio/comissoes` - Relatório de comissões por barbeiro

## Licença

MIT
