# TODO - Correção de aprovação admin (pending)

- [x] Criar migration/SQL: adicionar coluna `status` na tabela `users` (default 'pending').
- [x] Atualizar seed para criar admin(s) como `approved`.
- [x] Atualizar `server/models/users.js` para inserir/ler `status`.
- [x] Atualizar `server/routes/authForms.js`:
  - [x] no `/auth/register`, inserir usuários como `pending` e não criar token/redirect para o site
  - [x] redirecionar para mensagem no `auth.html`
- [x] Atualizar `server/middleware/resolveUser.js`:
  - [x] impedir acesso quando `status != 'approved'`.
- [x] Criar/atualizar rotas admin para aprovar e retirar acesso (pendente).
- [ ] Testar fluxo completo:
  - [ ] registro viewer -> não entra no `/index.html`
  - [ ] admin aprova -> login passa a liberar acesso
  - [ ] admin rejeita/retira -> usuário deixa de acessar


