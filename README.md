# Logística Sellers App

Aplicación simple para que cada seller vea sus órdenes, marque cuáles salen a entregar, envíe email automático al cliente y permita confirmación de entrega desde un link público.

## Stack

- Vite + React
- Supabase Auth + Database + Edge Functions
- Vercel
- Resend para emails transaccionales

## Funciones incluidas

- Login por seller.
- Panel rápido con Pendientes / En camino / Entregadas.
- Carga manual.
- Importación CSV.
- Edición y eliminación lógica de órdenes.
- Despacho masivo con botón “Sale a entregar”.
- Link público de tracking.
- Confirmación de entrega por cliente con últimos números de DNI.
- Base preparada para API mediante RPC `api_upsert_order`.

## 1. Crear proyecto en Supabase

1. Entrá a Supabase y creá un proyecto.
2. Abrí SQL Editor.
3. Pegá y ejecutá el contenido de `supabase/schema.sql`.
4. Creá un seller inicial:

```sql
insert into public.sellers(name) values ('Seller Demo');
```

5. Creá un usuario desde Authentication > Users.
6. Copiá el ID del usuario y el ID del seller.
7. Vinculalos:

```sql
insert into public.profiles(id, seller_id, full_name, role)
values ('ID_DEL_USUARIO', 'ID_DEL_SELLER', 'Usuario Seller', 'seller');
```

Para admin:

```sql
insert into public.profiles(id, full_name, role)
values ('ID_DEL_USUARIO', 'Admin General', 'admin');
```

## 2. Configurar variables locales

Copiá `.env.example` a `.env`:

```bash
cp .env.example .env
```

Completá:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
VITE_APP_URL=http://localhost:5173
```

## 3. Instalar y correr

```bash
npm install
npm run dev
```

## 4. Deploy en Vercel

1. Subí este proyecto a GitHub.
2. Importalo desde Vercel.
3. Agregá estas variables en Vercel:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
VITE_APP_URL=https://TU-APP.vercel.app
```

4. Deploy.

## 5. Edge Function de email

Instalá Supabase CLI y vinculá el proyecto:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy send-dispatch-email
```

Variables necesarias en Supabase:

```bash
supabase secrets set RESEND_API_KEY=TU_RESEND_KEY
supabase secrets set EMAIL_FROM="Logistica <no-reply@tudominio.com>"
supabase secrets set APP_URL="https://TU-APP.vercel.app"
```

La app igual funciona sin RESEND_API_KEY, pero el email queda registrado como `skipped`.

## 6. Formato CSV para importar

El CSV puede tener estos encabezados:

```csv
order_number,customer_email,customer_name,customer_lastname,dni,address,product,logistic_operator
1001,cliente@mail.com,Juan,Perez,12345678,"Av Siempre Viva 123",Notebook,Andreani
```

También reconoce algunos encabezados en español:

- `orden`
- `email`
- `nombre`
- `apellido`
- `DNI`
- `direccion`
- `producto`
- `operador`

## 7. API de órdenes

La forma recomendada es llamar a la RPC de Supabase desde un sistema externo seguro.

Ejemplo conceptual:

```js
await supabase.rpc('api_upsert_order', {
  p_seller_id: 'UUID_SELLER',
  p_order_number: '1001',
  p_customer_email: 'cliente@mail.com',
  p_customer_name: 'Juan',
  p_customer_lastname: 'Perez',
  p_dni: '12345678',
  p_address: 'Av Siempre Viva 123',
  p_product: 'Notebook',
  p_logistic_operator: 'Andreani'
})
```

Para producción conviene crear una Edge Function `api-orders` con API Key por seller.

## 8. Qué pedirle a Claude Code

Usá este prompt:

```txt
Tengo este proyecto Vite + React + Supabase para una app logística de sellers. Necesito que lo revises, mejores la seguridad de RLS, agregues una Edge Function api-orders con API Key por seller, mejores la UI manteniéndola simple y rápida, y prepares el deploy para Vercel. No agregues complejidad innecesaria: el flujo principal debe ser Orden recibida -> Seller tilda salida -> Email al cliente -> Cliente confirma entrega.
```
