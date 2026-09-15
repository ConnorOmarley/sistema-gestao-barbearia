# Instruções para criar o repositório no GitHub

## Passo 1: Criar o repositório no GitHub

1. Acesse: https://github.com/new
2. Nome do repositório: `sistema-gestao-barbearia`
3. Descrição (opcional): "Sistema web para gerenciar atendimentos e comissões de barbeiros"
4. Deixe como **Público** ou **Privado** (sua escolha)
5. **NÃO** marque "Add a README file" (já temos um)
6. Clique em "Create repository"

## Passo 2: Conectar e enviar o código

Após criar o repositório, copie e cole estes comandos no terminal (PowerShell) na pasta do projeto:

```powershell
cd "C:\Users\Carlos\OneDrive\Documentos\Default Project\barbearia-sistema"

git remote add origin https://github.com/alberttcarlosu/sistema-gestao-barbearia.git

git branch -M main

git push -u origin main
```

## Pronto!

Seu código estará no GitHub em: https://github.com/alberttcarlosu/sistema-gestao-barbearia

---

**Nota:** Se pedir autenticação, use seu Personal Access Token do GitHub (não a senha).
Para criar um token: https://github.com/settings/tokens
