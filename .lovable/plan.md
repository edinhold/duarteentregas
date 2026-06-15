## Causas-raiz encontradas

**1. Aba "Clientes" do painel admin vazia/inativa**
Em `src/pages/admin/AdminDashboard.tsx` existe o gatilho `<TabsTrigger value="customers">` (linha 241) e o componente `CustomersTab` está importado, mas **não há `<TabsContent value="customers">` correspondente**. Por isso, ao clicar em "Clientes" nada aparece. A consulta em si funciona — a policy `"Admins can view all profiles"` já permite ao admin enxergar todos os perfis (19 registros confirmados no banco).

**2. Cadastro de lojista cai no painel de clientes**
A policy de INSERT em `public.user_roles` é:
```
WITH CHECK (auth.uid() = user_id AND role = 'user')
```
Ou seja, o usuário só consegue se atribuir o papel `user`. Quando `RegisterStoreOwner.tsx` (e `RegisterDriver.tsx`) tenta inserir `role: 'store_owner'` / `'driver'`, o INSERT é bloqueado por RLS. O papel nunca é gravado, então no próximo login o `Index.tsx` não encontra `store_owner` em `user_roles` e o usuário cai na home de clientes.

## Mudanças

### A) Render da aba Clientes
Em `src/pages/admin/AdminDashboard.tsx`, adicionar logo após os demais `TabsContent`:
```tsx
<TabsContent value="customers"><CustomersTab /></TabsContent>
```

### B) Migração de RLS em `user_roles`
Substituir a policy de INSERT para permitir que o próprio usuário se atribua `user`, `driver` ou `store_owner` durante o auto-cadastro. `admin` e `moderator` continuam restritos a admins (policy "Admins can manage all roles" já cobre).

```sql
DROP POLICY "Users can self-assign user role" ON public.user_roles;

CREATE POLICY "Users can self-assign signup role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('user'::app_role, 'driver'::app_role, 'store_owner'::app_role)
  );
```

### C) Robustez do fluxo de cadastro lojista
Em `src/pages/register/RegisterStoreOwner.tsx`:
- Inserir o papel `store_owner` em `user_roles` **antes** de criar o restaurante e fazer uploads, para que, se a política falhar, o erro apareça imediatamente em vez de deixar o usuário órfão.
- Trocar `navigate("/lojista")` por `navigate("/lojista", { replace: true })`.
- Manter o `toast.error` já existente para qualquer falha.

Aplicar o mesmo `replace: true` em `RegisterDriver.tsx` para `/entregador` (não muda lógica, só evita voltar para o cadastro).

## Critérios de aceite
- Admin abre a aba "Clientes" e vê a lista de perfis com busca, promover para motorista e excluir funcionando.
- Novo cadastro de lojista entra direto em `/lojista` e, ao deslogar/logar de novo, continua sendo redirecionado para `/lojista`.
- Console sem erros de RLS (`new row violates row-level security policy for table "user_roles"`).
- Nenhuma outra aba/fluxo é alterado.