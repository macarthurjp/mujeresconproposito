# Auditoría independiente — Roles y permisos (RBAC) implementados por Codex

Fecha: 16 nov 2026 · Alcance: 6 módulos (Eventos y reuniones, Devocionales, Galería, Contenidos y publicaciones, Enviar aviso, Dashboard).

## A. Resumen ejecutivo

**¿Codex implementó correctamente el sistema?** En lo esencial, **sí**, pero **no estaba listo para producción**: la migración original falló **5 de 85** pruebas de seguridad y funcionalidad, incluida una fuga de datos personales (HIGH). Tras las correcciones locales de esta auditoría, la migración pasa **85/85**, existe un script de reversión verificado y todas las pruebas del proyecto pasan.

Estado de despliegue verificado en producción (solo lectura): la migración **NO está aplicada** (no existen `admin_roles`, `admin_role_assignments`, ni la versión `20261116120000` en `schema_migrations`). Estado: **migración preparada**, no aplicada en Staging (no existe) ni en Producción.

El trabajo de Codex estaba **sin commits**, en la rama `store-assets` (mezclado con otra tarea).

## B. Matriz de cumplimiento (después de las correcciones)

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1 | Solo Super Admin crea/edita roles | PASS | RPC `admin_save_role` + RLS `admin_roles`; 4 roles no-SA rechazados (tests `superadmin`) |
| 2 | Solo Super Admin asigna/revoca | PASS | `admin_assign_role`, `admin_remove_role_assignment`; rechazados para no-SA |
| 3 | Solo Super Admin cambia permisos por rol | PASS | `admin_save_role_permissions`; INSERT directo bloqueado por RLS |
| 4 | Excepciones individuales solo por Super Admin | PASS | `admin_save_user_overrides`; nadie (ni SA) cambia sus propias excepciones |
| 5 | Nadie modifica sus propios privilegios | PASS | `user_roles` UPDATE devuelve 0 filas; overrides propios rechazados |
| 6 | Roles Manager, Editor, Viewer | PASS | Sembrados sin permisos; configurables |
| 7 | Nombres de rol sin privilegios implícitos | PASS | Rol nuevo = 0 permisos; `crud` implícito eliminado (corrección) |
| 8 | Asignación por correo, sin identidades ficticias | PASS | Correo inexistente rechazado; ahora exige cuenta invitada (corrección) |
| 9 | Usuarios y roles existentes preservados | PASS | No toca `user_roles`; fallback legado para cuentas sin rol |
| 10 | Permisos individuales en un mismo rol | PASS | Manager A agrega fotos; Manager B (mismo rol, deny) no |
| 11 | `inherit` / `allow` / `deny` y permiso efectivo | PASS | Override > rol > legado; deny restringe permiso heredado |
| 12 | Varios roles por usuario | N/A (PASS) | Un rol por usuario (PK `user_id`): determinista |
| 13 | Eventos: ver/crear/editar/eliminar en backend | PASS | RLS por acción; Viewer bloqueado, Manager permitido |
| 14 | Devocionales: ver/crear/editar/eliminar/publicar | PARTIAL | Correcto; **despublicar** sigue reservado al Super Admin aunque se tenga `publish` |
| 15 | Galería: Viewer ve pero no sube/edita/elimina | PASS | Tabla + Storage bloqueados |
| 16 | Contenidos: ver/crear/editar/eliminar/publicar separados | PASS | Trigger impide publicar/ocultar sin `publish` |
| 17 | Avisos: acceso independiente del envío | PASS | `send-broadcast` exige `notices.send`; `view` solo vista previa |
| 18 | Dashboard controlado por «ver» | PASS (tras corrección) | RPC y lectura directa de `unirse` exigen `dashboard.view` |
| 19 | Dashboard no expone datos sensibles de otros módulos | PASS | Vista reducida sin correo/teléfono para quien no es Manager legado |
| 20 | Permisos en frontend (app) | PASS | `canAdmin()` en menú, pantallas, botones y gestos |
| 21 | Permisos en frontend (web `admin.html`) | PARTIAL | Web no actualizada: sigue reservada al Super Admin (seguro, pero sin RBAC) |
| 22 | Cambios de permisos con sesión activa | PASS | RLS evalúa en cada consulta; la app refresca al volver a cargar |
| 23 | Estrategia de reversión | PASS (tras corrección) | `supabase/rollbacks/…down.sql` verificado: estado idéntico |

## C. Auditoría de base de datos

- Tablas nuevas: `admin_permission_catalog` (21 permisos), `admin_roles` (nombre único sin mayúsculas), `admin_role_permissions` (PK compuesta, FK con cascade), `admin_role_assignments` (PK `user_id` → un rol por usuario; FK a `auth.users` cascade, a rol restrict), `admin_user_permission_overrides` (PK `user_id,permission_key`). Todas con RLS; escritura solo `is_super_admin()`.
- Funciones `SECURITY DEFINER` con `search_path=''`; `admin_user_has_permission` solo para `service_role`.
- Políticas reemplazadas: los nombres que borra coinciden con los reales de producción (verificado en `pg_policies`), así que no quedan políticas antiguas permisivas.
- La migración se aplicó sin errores sobre una réplica local del esquema de producción.
- Compatibilidad: las 6 cuentas reales tienen `read_only`; sin rol asignado conservan «ver Dashboard» como hoy (documentado abajo).

## D. Frontend y backend

- App: `getAccess()` carga `admin_current_module_permissions()` y, si la migración no existe aún, cae a los permisos antiguos (no rompe la app actual).
- Backend: toda restricción está en RLS, triggers, RPC y la Edge Function; ocultar botones no es la única barrera (verificado con llamadas directas a la base).

## E. Vulnerabilidades y problemas (migración original de Codex)

| Gravedad | Hallazgo | Reproducción segura (local) | Estado |
|---|---|---|---|
| **HIGH** | Denegar el Dashboard a un usuario con permiso legado `read_export` no impedía leer `unirse` directamente (correos, teléfonos, nacimiento) | Usuario RX con `dashboard.view` denegado → `select count(*) from unirse` = 1 | Corregido |
| MEDIUM | Inscripciones (nombre, correo, teléfono de asistentes) visibles con solo `content.view` (p. ej. Viewer) | Viewer → `select count(*) from inscripciones` = 1 | Corregido: exige `content.edit` |
| MEDIUM | Triggers bloqueaban procesos sin sesión (service_role, editor SQL) al crear/cambiar contenido | Insertar destacada visible como `postgres` → «No tienes permiso para publicar» | Corregido |
| MEDIUM | Con permiso de **editar** sin **crear** no se podía reemplazar la imagen (Storage exigía crear) | Rol «editar eventos» → subir `eventos/i.webp` rechazado | Corregido |
| LOW | Permiso legado `crud` concedía todo (incl. enviar avisos); no asignable, 0 cuentas | Lectura de código | Eliminado |
| LOW | Se podía asignar rol a una cuenta no invitada (sin `user_roles`) | `admin_assign_role('noauth@…')` funcionaba | Corregido |
| LOW | Vista previa de destinatarios no cargaba para usuarios con solo acceso | Código `avisos.tsx` | Corregido |
| LOW | Sin script de reversión | — | Añadido y verificado |
| INFO | Web `admin.html` sin RBAC | — | Pendiente (fuera de alcance de corrección) |
| INFO | Despublicar devocionales solo Super Admin | — | Pendiente de decisión |
| INFO | Cuentas sin rol con `read_only` ven el Dashboard (compatibilidad) | — | Para restringir: asignar un rol |

## F. Correcciones realizadas (locales, sin commit)

- `supabase/migrations/20261116120000_central_admin_roles.sql` (no aplicada en ningún entorno): las 6 correcciones de la tabla E.
- `supabase/rollbacks/20261116120000_central_admin_roles.down.sql`: nuevo; restaura políticas, funciones y permisos de producción.
- `supabase/tests/rbac_audit.py`: nuevo; 85 pruebas de autorización contra una réplica local.
- `mobile/src/app/admin/avisos.tsx`: vista previa con solo acceso.

## G. Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `rbac_audit.py` sobre migración **original** | 80/85 PASS (5 FAIL = defectos de la tabla E) |
| `rbac_audit.py` sobre migración **corregida** | **85/85 PASS** |
| Reversión: migrar → revertir → comparar con el estado previo | Idéntico (políticas, funciones, triggers, tablas; permisos iguales) |
| `npx tsc --noEmit` (app) | OK |
| `npx eslint src --quiet` (app) | OK |
| `npx playwright test` (web) | 25/25 PASS |
| `deno check send-broadcast` | OK |
| Pruebas E2E en dispositivo / staging | **No ejecutadas** (no hay staging; producción no se modifica) |

La réplica local reproduce de producción las columnas, restricciones, funciones, triggers, políticas y permisos de las tablas afectadas; `auth`/`storage` están simulados. No sustituye una prueba en un entorno Supabase real.

## H. Estado final

**REQUIERE APROBACIÓN** — correcciones locales completas; falta tu autorización para commit, aplicar la migración, desplegar `send-broadcast` y publicar la app.

## I. Recomendación de liberación

**CONDITIONAL GO** (para la versión corregida; la versión original de Codex era **NO-GO** por el hallazgo HIGH).

Condiciones antes de producción:
1. Revisar y hacer commit en una rama propia (hoy está mezclado en `store-assets`).
2. Aplicar la migración en producción **junto con** desplegar `send-broadcast` (la función nueva depende de `admin_user_has_permission`). Tener a mano el script de reversión.
3. Publicar la app por OTA solo después de la migración (la app nueva funciona también sin ella).
4. Probar en el teléfono con un Manager, un Editor y un Viewer reales.
5. Decidir: RBAC en la web y despublicar con permiso `publish`.

Esta recomendación no autoriza el despliegue.
