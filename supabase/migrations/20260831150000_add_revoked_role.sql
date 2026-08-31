-- El rol revoked mantiene la cuenta identificable, pero elimina inmediatamente
-- todos sus permisos mediante RLS. El Super Admin puede restaurarla después.

alter table public.user_roles
drop constraint if exists user_roles_role_check;

alter table public.user_roles
add constraint user_roles_role_check
check (role in ('crud', 'read_export', 'read_only', 'revoked'));

