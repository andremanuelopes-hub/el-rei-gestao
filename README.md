# El Rei Gestão — primeira versão funcional

Aplicação Next.js com autenticação Supabase, categorias de vendas/despesas, diário por data, totais e histórico no banco de dados. Os dois administradores já devem existir na tabela `public.administradores`.

## Executar localmente
1. Instalar Node.js 20 ou superior.
2. `npm install`
3. Copiar `.env.example` para `.env.local` e preencher `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave pública/publishable, nunca `service_role`).
4. `npm run dev` e abrir http://localhost:3000

## Publicar na Vercel
1. Criar repositório **privado** no GitHub com estes ficheiros (a pasta `app` é a raiz do projeto).
2. Vercel > Add New > Project > importar repositório.
3. Definir as mesmas duas variáveis de ambiente da `.env.local`.
4. Fazer Deploy. Em Supabase Authentication > URL Configuration definir Site URL para o domínio Vercel.
5. Testar entrada com as duas contas já autorizadas.

## Limitações desta versão
- Não importa os dados antigos do Excel.
- Não inclui ainda fornecedores, cofre, BPI ou exportação.
- Campos vazios não apagam valores já gravados; colocar 0 para os zerar.
- Os registos são guardados individualmente; se houver erro a meio, alguns valores podem já estar gravados.
- Antes de produção: testar permissões RLS, concorrência, backups e confirmar correspondência de fórmulas/categorias com o Excel.
- O alojamento comercial na Vercel pode exigir plano pago.
