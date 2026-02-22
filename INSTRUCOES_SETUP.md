# 🚀 Instruções de Configuração — B3 Rebalanceamento & IA

Este guia fornece o passo a passo completo para configurar o banco de dados centralizado e a API de dados para a sua aplicação.

## 1. Configuração do Supabase (Banco de Dados)

O Supabase é utilizado para armazenar os usuários, suas posições e o token da API.

### Passo 1: Criar conta e projeto
1. Acesse [supabase.com](https://supabase.com/) e crie uma conta gratuita.
2. Crie um novo projeto (ex: `b3-rebalanceamento`).
3. Aguarde a inicialização do banco de dados.

### Passo 2: Configurar as Tabelas
No painel do Supabase, vá em **SQL Editor** e execute o seguinte script para criar as tabelas necessárias:

```sql
-- Tabela de Usuários
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Posições (Carteira)
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  purchase_price DECIMAL NOT NULL,
  purchase_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Configurações Globais (Token Brapi)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Inserir placeholder do token (opcional)
INSERT INTO settings (key, value) VALUES ('brapi_token', 'SEU_TOKEN_AQUI');
```

### Passo 3: Obter as Chaves de Acesso
1. Vá em **Project Settings** > **API**.
2. Copie a **Project URL**.
3. Copie a **anon public API key**.

### Passo 4: Atualizar o código
No arquivo `app.js`, substitua os valores nas primeiras linhas:
```javascript
const SUPABASE_URL = 'COLE_AQUI_SUA_URL';
const SUPABASE_KEY = 'COLE_AQUI_SUA_CHAVE_ANON';
```

---

## 2. Configuração do Token Brapi.dev

Para que os preços e dividendos sejam atualizados em tempo real, você precisa de um token.

1. Acesse [brapi.dev](https://brapi.dev/) e crie uma conta gratuita.
2. Copie o seu **Token**.
3. No Supabase, vá na tabela `settings` e atualize o valor da chave `brapi_token` com o seu novo token.
   - *Dica: Você também pode salvar o token via interface "Sobre" no site, mas salvar no banco de dados garante que seja o "Token Mestre" para todos.*

---

## 3. Hospedagem no GitHub Pages

1. Faça o upload dos arquivos para um repositório no GitHub.
2. Vá em **Settings** > **Pages**.
3. Selecione a branch `main` e clique em **Save**.
4. O site estará disponível em `https://seu-usuario.github.io/nome-do-repo`.

---
*Aviso: Certifique-se de que as tabelas tenham permissões de leitura/escrita habilitadas (RLS - Row Level Security pode ser configurado ou desabilitado para simplificar inicialmente).*
