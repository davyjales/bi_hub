# Migrações do banco (bases já existentes)

Não reimporte `schema.sql` em produção — use estes scripts incrementais.

## Ordem recomendada

| Ficheiro | Quando aplicar |
|----------|----------------|
| `002_bi_file_audit.sql` ou `003_add_bi_file_audit.sql` | Se a tabela `bi_file_audit` ainda não existir |
| `001_owner_setor_audit_edit.sql` | Role `owner_setor` + acção `edit` no histórico |
| `004_hub_directory_audit.sql` | Histórico de criação/renomeação/exclusão de diretórios |
| `005_users_email.sql` | Coluna `email` em `users` (recuperação de palavra-passe) |

## Como executar

### Opção A — script Node (recomendado)

Na pasta `server` (com `.env`):

```bash
npm run migrate
```

Aplica apenas ficheiros `.sql` ainda não registados em `schema_migrations`.

Para um ficheiro específico:

```bash
npm run migrate -- 001_owner_setor_audit_edit.sql
```

### Opção B — mysql CLI

```bash
mysql -u USER -p NOME_DA_BASE < database/migrations/001_owner_setor_audit_edit.sql
```

## Instalação nova

Use `database/schema.sql` (já inclui `owner_setor` e `edit`) e depois `npm run seed` na pasta `server`.
