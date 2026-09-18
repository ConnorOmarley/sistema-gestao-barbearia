
  CREATE TABLE IF NOT EXISTS barbeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    comissao_percentual REAL NOT NULL,
    is_dono INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    valor REAL NOT NULL,
    apenas_dono INTEGER DEFAULT 0,
    comissao_fixa_pct REAL DEFAULT NULL,
    ativo INTEGER DEFAULT 1
  );

CREATE TABLE IF NOT EXISTS atendimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barbeiro_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    valor_cobrado REAL NOT NULL,
    valor_tinta REAL DEFAULT 0,
    tem_pigmentacao INTEGER DEFAULT 0,
    comissao_percentual REAL NOT NULL,
    valor_comissao REAL NOT NULL,
    data_hora TEXT NOT NULL,
    observacao TEXT,
    FOREIGN KEY (barbeiro_id) REFERENCES barbeiros(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  );

  CREATE TABLE IF NOT EXISTS atendimento_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atendimento_id INTEGER NOT NULL,
    servico_id INTEGER NOT NULL,
    valor_cobrado REAL NOT NULL,
    valor_tinta REAL DEFAULT 0,
    tem_pigmentacao INTEGER DEFAULT 0,
    comissao_percentual REAL NOT NULL,
    valor_comissao REAL NOT NULL,
    FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE CASCADE,
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON atendimentos(data_hora);
  CREATE INDEX IF NOT EXISTS idx_atendimentos_barbeiro ON atendimentos(barbeiro_id);
  CREATE INDEX IF NOT EXISTS idx_itens_atendimento ON atendimento_itens(atendimento_id);
