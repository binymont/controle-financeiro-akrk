# Controle Financeiro | Grupo AKRK

Projeto fictício de controle financeiro para o Grupo AKRK. Cada conta gerencia suas categorias e transações e acompanha o saldo, os totais por período e as três categorias com mais saídas.

O backend NestJS tem seis arquivos em `src`. O React está em `frontend/src`. A pasta `prisma` reúne o modelo, a migration e os dados de demonstração. A compilação recria `dist` e gera o cliente do Prisma em `src/generated`. O Git ignora essas pastas.

## Como rodar

**Pré-requisitos** — Node.js 24 com npm e um servidor PostgreSQL em execução. Os comandos abaixo usam PowerShell.

### 1. Instale a API e prepare a configuração

Abra um terminal na pasta do projeto.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

No PostgreSQL, crie o banco `controle_financeiro` pelo pgAdmin ou com `createdb -U postgres controle_financeiro`. Gere uma chave para assinar as sessões.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Preencha o arquivo `.env` na raiz.

| Variável | O que preencher |
| --- | --- |
| `DATABASE_URL` | A conexão com o seu banco, incluindo usuário, senha, host e nome do banco. Use o formato de `.env.example`. |
| `JWT_SECRET` | O valor gerado pelo comando acima. |
| `PORT` | Porta da API. O padrão local é `3000`. |
| `FRONTEND_URL` | Origem da interface. O padrão local é `http://localhost:5173`. |

### 2. Aplique as migrações e inicie a API

```powershell
npm run db:deploy
npm run db:seed
npm run start:dev
```

O comando `db:deploy` aplica as migrações pendentes. O `db:seed` compila a API e cria a conta fictícia na primeira execução. Os cadastros e lançamentos ficam no PostgreSQL e permanecem disponíveis após reiniciar a aplicação.

### 3. Inicie o frontend

Abra outro terminal na pasta do projeto.

```powershell
cd frontend
npm ci
npm run dev
```

Abra [a interface local](http://localhost:5173) e entre com a conta abaixo para ver os lançamentos fictícios. Você também pode criar uma conta própria, que começa com saldo zero.

| Conta de demonstração | Valor |
| --- | --- |
| E-mail | `demo@akrk.example` |
| Senha | `DemoAKRK2026!` |

Se mudar a porta da API, defina `API_PROXY_TARGET` no terminal do frontend antes de iniciá-lo, como em `$env:API_PROXY_TARGET = 'http://127.0.0.1:3001'`.

## Decisões do projeto

- O JWT identifica o dono dos dados. Consultas e gravações usam esse ID, inclusive ao vincular uma categoria a uma transação.
- O valor é armazenado em centavos inteiros e a data como dia de calendário. O saldo usa todo o histórico. Na Visão geral, **Todo o período** limpa o filtro dos demais indicadores.
- O React usa Context API porque só a sessão é compartilhada entre telas. Formulários e filtros ficam no estado local, e o Fetch trata a comunicação com a API.
- O céu e a lua usam imagens WebP separadas. As animações usam CSS e respeitam a preferência por movimento reduzido.

## API e testes

| Recurso | Rota |
| --- | --- |
| Cadastro e login | `POST /api/auth/register`, `POST /api/auth/login` |
| Categorias | `GET` e `POST /api/categories`, `GET`, `PATCH` e `DELETE /api/categories/:id` |
| Transações | `GET` e `POST /api/transactions`, `PUT` e `DELETE /api/transactions/:id` |
| Dashboard | `GET /api/transactions/summary` |

Categorias, transações e dashboard usam `Authorization: Bearer <token>`. A listagem aceita `page`, `limit`, `type`, `categoryId`, `startDate` e `endDate`. O dashboard aceita `startDate` e `endDate`. As datas usam `AAAA-MM-DD`.

Execute `npm test` na raiz para compilar a API e rodar os seis testes. Execute `npm run build` em `frontend` para compilar a interface.

Para acompanhar uma chamada, abra o Console do navegador e filtre por `AKRK API`. O terminal do NestJS também registra método, rota, status e duração das respostas concluídas. Os logs omitem credenciais, consultas, identificadores e valores financeiros.

## Entrega

[Repositório no GitHub](https://github.com/binymont/controle-financeiro-akrk)

O GitHub Actions aplica as migrações em um PostgreSQL temporário, roda os testes da API e compila a interface a cada envio de commits e abertura ou atualização de uma solicitação de integração.

Para publicar, conecte a API a um PostgreSQL persistente e configure as variáveis do `.env.example` na hospedagem. Compile com `npm ci --include=dev && npm run build`, aplique as migrações com `npm run db:deploy` e inicie com `npm run start:prod`. Use o mesmo comando de compilação na pasta `frontend` e publique o conteúdo de `frontend/dist`. Execute `npm run db:seed` uma vez para disponibilizar a conta de demonstração.

Na hospedagem, configure `FRONTEND_URL` na API com a origem pública da interface. Defina `VITE_API_URL` antes de compilar a interface com a URL pública da API incluindo `/api`. Configure a hospedagem do frontend para servir `index.html` nas rotas da interface.

[Aplicação pública no Render](https://controle-financeiro-akrk.onrender.com/)

O site público usa um PostgreSQL separado no Neon. Entre com a conta de demonstração acima ou cadastre uma conta no próprio site.
