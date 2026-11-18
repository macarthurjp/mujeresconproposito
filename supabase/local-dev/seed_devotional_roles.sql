-- LOCAL TEST DATA ONLY. Apply only to the isolated Supabase container.
-- Never run with `supabase db push` or against a hosted project.
begin;

insert into public.admin_roles (name, description)
values ('Revisor Editorial', 'Rol local de prueba para revisar devocionales ajenos.')
on conflict (lower(name)) do update
  set description = excluded.description,
      updated_at = now();

insert into public.admin_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.admin_roles r
cross join (values
  ('Editor', 'devotionals.view'),
  ('Editor', 'devotionals.create'),
  ('Editor', 'devotionals.edit'),
  ('Revisor Editorial', 'devotionals.view'),
  ('Revisor Editorial', 'devotionals.edit'),
  ('Revisor Editorial', 'devotionals.publish')
) as p(role_name, permission_key)
where r.name = p.role_name
on conflict (role_id, permission_key) do nothing;

commit;
