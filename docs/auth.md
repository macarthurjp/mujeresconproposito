# Autenticación y acceso (MCP930)

## Modelo actual: solo por invitación

- La web pública y la app son de libre uso **sin cuenta** (reuniones, devocionales, galería, formularios).
- Las cuentas existen solo para el **panel privado** (admin web, dashboard y Administración en la app).
- Una cuenta solo se crea cuando un **Super Admin la invita** desde *Usuarios* (`manage-users`, acción `invite` → `auth.admin.inviteUserByEmail`). La persona activa la cuenta fijando su contraseña en `https://mcp930.org/reset-password.html`.
- Inicio de sesión: **correo + contraseña** (web y app; en la app, opcionalmente Face ID / huella, que guarda esas credenciales en el llavero del dispositivo).
- Recuperación: «Olvidé mi contraseña» (`resetPasswordForEmail`), que solo funciona para cuentas existentes y no crea ninguna.

## Defensas (no dependen de ocultar botones)

| Capa | Qué impide |
|---|---|
| Supabase Auth `disable_signup = true` | Registro público por correo **y** por Apple/Google: un correo desconocido no puede crear cuenta. |
| `manage-users` | Solo un Super Admin no revocado puede invitar, revocar o cambiar roles. |
| Trigger `assign_default_user_role` | Toda cuenta nueva nace con `user_roles` **sin permisos**. |
| `is_super_admin()`, `has_admin_module_permission()` y RLS | Sin rol ni permisos, una cuenta autenticada solo ve el contenido público (igual que un visitante anónimo) y no puede escribir ni ascenderse. |
| Revocación | `user_roles.is_revoked` + `banned_until` en Auth: sin acceso aunque tenga sesión. |
| Clientes (`canAccessAdminPanel`, `authorizeReturnedUser`) | Cierran la sesión si la cuenta no tiene permisos. |

Comprobado el 2026-11-20 en producción con una cuenta simulada sin invitación dentro de una transacción revertida: 0 permisos, solo tablas públicas legibles, 0 filas modificables.

Organizaciones: el sistema es de **una sola organización** (Mujeres con Propósito 930 a.s.b.l.); no hay datos de varias organizaciones que aislar. Un futuro módulo multi-organización necesitaría una columna de organización y políticas RLS por organización.

## Apple y Google: desactivados (reactivables)

El código sigue en su sitio y se controla con un único interruptor por plataforma:

- App: `OAUTH_PROVIDERS_ENABLED` en `mobile/src/lib/admin.ts` (se publica por OTA).
- Web: `OAUTH_ENABLED` en `assets/js/social-auth.js` (sube la versión `?v=` en `admin.html` y `dashboard.html`).

Con el interruptor en `false`: no se consulta qué proveedores hay, los botones no se muestran (también ocultos en el HTML desde el primer pintado) y `signIn`/`signInWithProvider` rechazan el intento.

**Para reactivar:** poner ambos interruptores en `true`, comprobar que Apple y Google siguen activos en Supabase → Authentication → Providers (credenciales de Apple: Service ID, Team ID, Key ID y clave; Google: client ID y secret), y publicar web + OTA. La app iOS mantiene la capacidad «Sign in with Apple» (`usesAppleSignIn` en `app.json`), así que no hace falta un build nuevo.

**Desactivación en el servidor (opcional, manual):** en Supabase → Authentication → Providers se pueden apagar Apple y Google sin borrar sus credenciales (interruptor *Enabled*). Antes, confirmar que ninguna cuenta depende solo de ellos: a 2026-11-20 solo un Super Admin tenía identidad Apple, y esa cuenta también tiene contraseña de correo.

## Futuro: módulo de miembros

Mantener separado del panel administrativo: un rol o tabla propia de miembros (no `user_roles` de admins), invitaciones o registro controlado (p. ej. un hook *before user created* o una lista de correos permitidos) y permisos propios. Apple/Google se pueden reactivar para ese módulo con los interruptores anteriores.

## Pruebas

`tests/site.spec.js` → «private access is invitation-only…»: aunque Supabase informe Apple y Google activos, la web no muestra los botones y `McpSocialAuth.enabled` es `false`.
