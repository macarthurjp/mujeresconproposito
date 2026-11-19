# Prueba local del flujo editorial de Devocionales

Este entorno usa el Supabase local aislado `mcp930-devocional-isolated`.
No copies usuarios ni datos reales y no ejecutes estos pasos contra un proyecto alojado.

## Direcciones locales

- Web: http://127.0.0.1:4174/admin.html
- Supabase Studio: http://127.0.0.1:55423/project/default
- Supabase API: `http://127.0.0.1:55421`

La base local ya tiene las migraciones `20261118100000` y `20261118110000`.
También se cargaron datos locales para los roles `Editor` y `Revisor Editorial`.
El primero puede visualizar, crear y editar; el segundo puede visualizar, editar y publicar.

## Crear cuentas aisladas

1. Abre Supabase Studio local y entra en **Authentication → Users**.
2. Crea tres cuentas de prueba con correos `example.test`, por ejemplo:
   - `local-admin@example.test`
   - `local-autora@example.test`
   - `local-revisora@example.test`
3. Usa contraseñas temporales distintas y confirma los usuarios desde Studio si aparece esa opción.
4. En **SQL Editor** de Studio local, convierte únicamente la cuenta local de administración en Super Admin:

```sql
update public.user_roles
set is_super_admin = true, is_revoked = false, updated_at = now()
where user_id = (
  select id from auth.users where email = 'local-admin@example.test'
);
```

5. Inicia sesión en la web local con esa cuenta y asigna el rol `Editor` a `local-autora@example.test` y `Revisor Editorial` a `local-revisora@example.test` desde **Usuarios y roles**.

Si Studio no creó la fila de `user_roles` automáticamente, primero verifica el trigger `assign_default_user_role_after_signup`; no crees filas de asignación con IDs inventados.

## Conectar la web local

Obtén la clave pública local desde **Project Settings → API Keys** en Studio local. En la pestaña del navegador abierta en `127.0.0.1:4174`, abre DevTools → Console y ejecuta, sustituyendo el valor de ejemplo por la clave local:

```js
localStorage.setItem('mcp930.localSupabase', JSON.stringify({
  url: 'http://127.0.0.1:55421',
  anonKey: 'PEGA_AQUI_LA_CLAVE_PUBLICA_LOCAL'
}));
location.reload();
```

La configuración queda guardada solo para el origen `127.0.0.1:4174`. Si falta, la web local falla cerrada; no usa el Supabase alojado como alternativa.

## Conectar la app móvil al mismo Supabase local

Desde Supabase Studio local copia la misma clave pública local. En `mobile/.env.local` define:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
EXPO_PUBLIC_SUPABASE_ANON_KEY=PEGA_AQUI_LA_CLAVE_PUBLICA_LOCAL
EXPO_PUBLIC_SITE_URL=http://127.0.0.1:4174
```

Luego, desde `mobile/`, inicia el cliente de desarrollo instalado:

```sh
npx expo start --dev-client --ios
```

En builds de desarrollo, la app rechaza URLs que no sean `localhost` o `127.0.0.1`; si faltan las variables no contacta producción. Los formularios protegidos por Turnstile quedan bloqueados en local, sin fallback al servicio alojado. Los avisos Edge también requieren sus funciones locales para probarse; no se consideran cubiertos solo por tener local la base de datos.

## Escenario editorial

1. Entra como `local-autora@example.test`, crea un devocional y envíalo a revisión.
2. Entra como `local-revisora@example.test`, abre la cola, toma la revisión y solicita cambios o apruébalo.
3. Vuelve como autora, corrige y reenvía si solicitó cambios.
4. Confirma estados, historial, permisos y visibilidad en web y app.

No migres estas tablas/roles a producción desde este entorno. Las migraciones del flujo siguen en la rama `feature/devocionales-editorial-workflow-v2`.
