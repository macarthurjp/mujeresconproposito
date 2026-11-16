#!/usr/bin/env python3
"""Local RBAC audit for migration 20261116120000_central_admin_roles.sql.

Runs against a LOCAL Postgres that mirrors the production schema (never a
remote database). Each test runs in its own transaction as a simulated
Supabase user (role `authenticated` + JWT claims) and is rolled back, so tests
are independent. Setup is done through the real RPCs as the Super Admin.

Usage: PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d mcp" python3 rbac_audit.py
"""
import json
import os
import shlex
import subprocess
import sys

PSQL = shlex.split(os.environ.get("PSQL", "psql -h 127.0.0.1 -p 55432 -U postgres -d mcp"))

U = {
    "SA": "00000000-0000-0000-0000-0000000000a1",
    "MGR_A": "00000000-0000-0000-0000-0000000000b1",
    "MGR_B": "00000000-0000-0000-0000-0000000000b2",
    "EDT": "00000000-0000-0000-0000-0000000000c1",
    "VWR": "00000000-0000-0000-0000-0000000000d1",
    "LEG": "00000000-0000-0000-0000-0000000000e1",   # legacy read_only only (like prod users)
    "RX": "00000000-0000-0000-0000-0000000000e2",    # legacy read_export + Viewer role, dashboard denied
    "REV": "00000000-0000-0000-0000-0000000000f1",   # revoked, but has a Manager assignment
    "EDT_EVENTS": "00000000-0000-0000-0000-0000000000c2",  # custom role: events view+edit only
    "NOAUTH": "00000000-0000-0000-0000-0000000000f9",
    "APPREV": "00000000-0000-0000-0000-0000000000fa",  # appreview@matmaxconsulting.com  # auth account that was never invited (no user_roles row)
}


def run(sql, user=None, role="authenticated", commit=False):
    claims = json.dumps({"sub": U[user], "role": role}) if user else json.dumps({"role": role})
    db_role = "service_role" if role == "service_role" else ("anon" if role == "anon" else "authenticated")
    script = (
        "\\set ON_ERROR_STOP 1\nbegin;\n"
        "\\o /dev/null\n"
        f"select set_config('request.jwt.claims', {sql_literal(claims)}, true);\n"
        "\\o\n"
        f"set local role {db_role};\n{sql}\n" + ("commit;\n" if commit else "rollback;\n")
    )
    p = subprocess.run(PSQL + ["-qtA"], input=script, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout + p.stderr).strip()


def sql_literal(text):
    return "'" + text.replace("'", "''") + "'"


def sa(sql):
    ok, out = run(sql, "SA", commit=True)
    if not ok:
        sys.exit(f"SETUP FAILED: {sql}\n{out}")
    return out


def setup():
    users = ",".join(f"('{v}','{k.lower()}@test.local')" for k, v in U.items() if k not in ("NOAUTH",))
    seed = subprocess.run(PSQL + ["-q", "-v", "ON_ERROR_STOP=1"], input=f"""
      set session_replication_role = replica;  -- seed only: skip triggers
      insert into auth.users(id,email) values {users};
      insert into public.user_roles(user_id,email,nombre,is_super_admin,permissions,is_revoked) values
        ('{U['SA']}','sa@test.local','SA',true,'{{read_only}}',false),
        ('{U['MGR_A']}','mgr_a@test.local','A',false,'{{read_only}}',false),
        ('{U['MGR_B']}','mgr_b@test.local','B',false,'{{read_only}}',false),
        ('{U['EDT']}','edt@test.local','E',false,'{{read_only}}',false),
        ('{U['VWR']}','vwr@test.local','V',false,'{{read_only}}',false),
        ('{U['LEG']}','leg@test.local','L',false,'{{read_only}}',false),
        ('{U['RX']}','rx@test.local','X',false,'{{read_only,read_export}}',false),
        ('{U['REV']}','rev@test.local','R',false,'{{read_only}}',false),
        ('{U['EDT_EVENTS']}','edt_events@test.local','EE',false,'{{read_only}}',false),
        ('{U['APPREV']}','appreview@matmaxconsulting.com','AR',false,'{{read_only}}',false);
      insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (1,'Oración','Martes 20:00','🙏','https://meet.google.com/x',true,1);
      insert into public.galeria(foto_url,categoria,texto,activa,orden) values ('https://x/1.webp','Europa','Picnic',true,1);
      insert into public.destacadas(id,nombre,foto_url,activa,orden) values ('11111111-1111-1111-1111-111111111111','Retiro','https://x/d.webp',true,1);
      insert into auth.users(id,email) values ('{U['NOAUTH']}','noauth@test.local') on conflict do nothing;
      insert into public.inscripciones(destacada_id,nombre,email,acompanantes) values ('11111111-1111-1111-1111-111111111111','Invitada','inv@test.local',0);
      insert into public.unirse(id,nombre,apellido,email,telefono,fecha_nacimiento,pais_nacimiento,pais_residencia,cristiana,comunidad,created_at)
        values ('22222222-2222-2222-2222-222222222222','Ana','P','ana@test.local','+352','1990-01-01','RD','Luxemburgo','Sí','Europa',now());
    """, capture_output=True, text=True)
    if seed.returncode:
        sys.exit("SEED FAILED: " + seed.stderr)
    # Migrations that act on existing data (e.g. assigning the review account) are re-run
    # after seeding, like they would run against production data.
    for path in filter(None, os.environ.get("POST_SEED_SQL", "").split(":")):
        r = subprocess.run(PSQL + ["-q", "-v", "ON_ERROR_STOP=1", "-f", path], capture_output=True, text=True)
        if r.returncode:
            sys.exit("POST SEED FAILED: " + r.stderr)
    ids = {}
    for name in ("Manager", "Editor", "Viewer"):
        ids[name] = sa(f"select id from public.admin_roles where name='{name}';").splitlines()[-1]
    perms = {
        "Manager": ["events.view", "events.create", "events.edit", "events.delete", "gallery.view", "gallery.add", "gallery.edit",
                    "gallery.delete", "content.view", "content.create", "content.edit", "content.delete", "notices.view",
                    "notices.send", "dashboard.view", "devotionals.view"],
        "Editor": ["content.view", "content.create", "content.edit", "devotionals.view", "devotionals.create", "devotionals.edit"],
        "Viewer": ["events.view", "gallery.view", "content.view", "devotionals.view", "notices.view", "dashboard.view"],
    }
    for name, keys in perms.items():
        arr = "array[" + ",".join(f"'{k}'" for k in keys) + "]::text[]"
        sa(f"select public.admin_save_role_permissions('{ids[name]}', {arr});")
    for user, role in (("MGR_A", "Manager"), ("MGR_B", "Manager"), ("EDT", "Editor"), ("VWR", "Viewer"), ("RX", "Viewer"), ("REV", "Manager")):
        sa(f"select public.admin_assign_role('{user.lower()}@test.local','{ids[role]}');")
    ev = sa("select public.admin_save_role('Editor de eventos','Solo editar');").splitlines()[-1]
    sa(f"select public.admin_save_role_permissions('{ev}', array['events.view','events.edit']::text[]);")
    sa(f"select public.admin_assign_role('edt_events@test.local','{ev}');")
    # Same role, different individual permissions: Manager B loses gallery add/edit/delete.
    sa(f"""select public.admin_save_user_overrides('{U['MGR_B']}', '{{"gallery.add":false,"gallery.edit":false,"gallery.delete":false}}'::jsonb);""")
    sa(f"""select public.admin_save_user_overrides('{U['RX']}', '{{"dashboard.view":false}}'::jsonb);""")
    subprocess.run(PSQL + ["-q"], input=f"update public.user_roles set is_revoked=true where user_id='{U['REV']}';", check=True,
                   capture_output=True, text=True)
    return ids


RESULTS = []


def check(area, name, ok_expected, sql, user=None, role="authenticated", must_contain=None):
    ok, out = run(sql, user, role)
    passed = ok == ok_expected and (must_contain is None or must_contain in out)
    RESULTS.append((area, name, passed, ok, out.splitlines()[-1][:150] if out else ""))


def main():
    ids = setup()
    R = ids
    # --- Super Admin exclusivity -------------------------------------------------
    for u in ("MGR_A", "EDT", "VWR", "LEG"):
        check("superadmin", f"{u} no puede crear rol", False, "select public.admin_save_role('Hack','');", u)
        check("superadmin", f"{u} no puede cambiar permisos de rol", False,
              f"select public.admin_save_role_permissions('{R['Viewer']}', array['events.delete']);", u)
        check("superadmin", f"{u} no puede asignar roles", False,
              f"select public.admin_assign_role('{u.lower()}@test.local','{R['Manager']}');", u)
        check("superadmin", f"{u} no puede auto-concederse excepciones", False,
              f"""select public.admin_save_user_overrides('{U[u]}', '{{"notices.send":true}}'::jsonb);""", u)
        check("superadmin", f"{u} no puede quitar asignaciones", False, f"select public.admin_remove_role_assignment('{U['MGR_A']}');", u)
        check("superadmin", f"{u} INSERT directo en overrides bloqueado", False,
              f"insert into public.admin_user_permission_overrides(user_id,permission_key,allowed) values ('{U[u]}','notices.send',true);", u)
        check("superadmin", f"{u} INSERT directo en role_permissions bloqueado", False,
              f"insert into public.admin_role_permissions(role_id,permission_key) values ('{R['Viewer']}','events.delete');", u)
        check("superadmin", f"{u} no ve asignaciones ajenas", True,
              "select count(*) from public.admin_role_assignments where user_id <> auth.uid();", u, must_contain="0")
        check("superadmin", f"{u} no ve roles ajenos", True,
              "select count(*) from public.admin_roles r where not exists (select 1 from public.admin_role_assignments a where a.role_id=r.id and a.user_id=auth.uid());", u, must_contain="0")
        check("superadmin", f"{u} no puede hacerse super admin (0 filas)", True,
              f"with x as (update public.user_roles set is_super_admin=true where user_id='{U[u]}' returning 1) select count(*) from x;", u, must_contain="0")
    check("superadmin", "Manager lee el nombre de su propio rol", True,
          "select r.name from public.admin_role_assignments a join public.admin_roles r on r.id=a.role_id where a.user_id=auth.uid();", "MGR_A", must_contain="Manager")
    check("superadmin", "SA crea rol personalizado", True, "select public.admin_save_role('Coordinadora','Prueba');", "SA")
    check("superadmin", "SA no puede editar sus propias excepciones", False,
          f"""select public.admin_save_user_overrides('{U['SA']}','{{}}'::jsonb);""", "SA")
    check("superadmin", "Asignar correo inexistente falla (no crea identidades)", False,
          f"select public.admin_assign_role('nadie@test.local','{R['Viewer']}');", "SA")
    check("superadmin", "Nombre de rol no concede privilegios (rol nuevo sin permisos)", True,
          "select count(*) from public.admin_role_permissions p join public.admin_roles r on r.id=p.role_id where r.name='Coordinadora';",
          "SA", must_contain="0")

    # --- Effective permissions / overrides ---------------------------------------
    eff = "select public.has_admin_module_permission('{m}','{a}');"
    check("overrides", "MGR_A hereda gallery.add del rol", True, eff.format(m="gallery", a="add"), "MGR_A", must_contain="t")
    check("overrides", "MGR_B deny restringe gallery.add heredado", True, eff.format(m="gallery", a="add"), "MGR_B", must_contain="f")
    check("overrides", "MGR_B conserva gallery.view", True, eff.format(m="gallery", a="view"), "MGR_B", must_contain="t")
    check("overrides", "Revocado con rol Manager: sin permisos", True, eff.format(m="events", a="create"), "REV", must_contain="f")
    check("overrides", "anon no puede consultar permisos", False, eff.format(m="events", a="view"), None, "anon")

    # --- Eventos ------------------------------------------------------------------
    check("eventos", "Viewer no crea", False, "insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (9,'x','Lunes 10:00','x','https://x',true,9);", "VWR")
    check("eventos", "Viewer no edita (0 filas)", True, "with u as (update public.eventos set titulo='hack' where id=1 returning 1) select count(*) from u;", "VWR", must_contain="0")
    check("eventos", "Viewer no elimina (0 filas)", True, "with d as (delete from public.eventos where id=1 returning 1) select count(*) from d;", "VWR", must_contain="0")
    check("eventos", "Manager crea", True, "insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (9,'x','Lunes 10:00','x','https://x',true,9);", "MGR_A")
    check("eventos", "Manager elimina", True, "with d as (delete from public.eventos where id=1 returning 1) select count(*) from d;", "MGR_A", must_contain="1")
    check("eventos", "Revocado no crea", False, "insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (9,'x','Lunes 10:00','x','https://x',true,9);", "REV")
    check("eventos", "anon no crea", False, "insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (9,'x','Lunes 10:00','x','https://x',true,9);", None, "anon")

    # --- Galería --------------------------------------------------------------------
    gins = "insert into public.galeria(foto_url,categoria,texto,activa,orden) values ('https://x/2.webp','Europa','t',true,2);"
    check("galeria", "Viewer ve imágenes", True, "select count(*) from public.galeria;", "VWR", must_contain="1")
    check("galeria", "Viewer no sube", False, gins, "VWR")
    check("galeria", "Viewer no sube archivo a storage", False, "insert into storage.objects(bucket_id,name) values ('mcp930-images','galeria/a.webp');", "VWR")
    check("galeria", "Viewer no elimina (0 filas)", True, "with d as (delete from public.galeria returning 1) select count(*) from d;", "VWR", must_contain="0")
    check("galeria", "MGR_A sube", True, gins, "MGR_A")
    check("galeria", "MGR_B (deny add) no sube", False, gins, "MGR_B")
    check("galeria", "MGR_B (deny edit) no edita (0 filas)", True, "with u as (update public.galeria set texto='x' returning 1) select count(*) from u;", "MGR_B", must_contain="0")

    # --- Contenido y publicaciones -------------------------------------------------
    check("contenido", "Editor crea oculta", True,
          "insert into public.destacadas(nombre,foto_url,activa,orden) values ('n','https://x/e.webp',false,2);", "EDT")
    check("contenido", "Editor no publica al crear (activa=true)", False,
          "insert into public.destacadas(nombre,foto_url,activa,orden) values ('n','https://x/e.webp',true,2);", "EDT")
    check("contenido", "Editor no publica/oculta existente", False,
          "update public.destacadas set activa=false where id='11111111-1111-1111-1111-111111111111' returning 1;", "EDT")
    check("contenido", "Editor edita texto", True,
          "update public.destacadas set nombre='Retiro 2' where id='11111111-1111-1111-1111-111111111111' returning 1;", "EDT", must_contain="1")
    check("contenido", "Editor no elimina (0 filas)", True,
          "with d as (delete from public.destacadas returning 1) select count(*) from d;", "EDT", must_contain="0")
    check("contenido", "Viewer no edita (0 filas)", True,
          "with u as (update public.destacadas set nombre='x' returning 1) select count(*) from u;", "VWR", must_contain="0")
    check("contenido", "Viewer no crea", False,
          "insert into public.destacadas(nombre,foto_url,activa,orden) values ('n','https://x/e.webp',false,2);", "VWR")

    # --- Devocionales ---------------------------------------------------------------
    check("devocionales", "Editor crea borrador", True,
          f"insert into public.devocionales(id,slug,created_by,pending_content) values (101,'nuevo','{U['EDT']}','{{\"titulo\":\"t\",\"contenido\":\"c\"}}');", "EDT")
    check("devocionales", "Editor no crea publicado", False,
          f"insert into public.devocionales(id,slug,created_by,publicado,fecha_publicacion,titulo) values (102,'pub','{U['EDT']}',true,now(),'t');", "EDT")
    check("devocionales", "Viewer no crea", False,
          f"insert into public.devocionales(id,slug,created_by,pending_content) values (103,'v','{U['VWR']}','{{}}');", "VWR")

    # --- Enviar aviso -----------------------------------------------------------------
    perm = "select public.admin_user_has_permission('{u}','notices','{a}');"
    check("avisos", "Viewer accede (view)", True, perm.format(u=U["VWR"], a="view"), None, "service_role", must_contain="t")
    check("avisos", "Viewer NO envía (send)", True, perm.format(u=U["VWR"], a="send"), None, "service_role", must_contain="f")
    check("avisos", "Manager envía", True, perm.format(u=U["MGR_A"], a="send"), None, "service_role", must_contain="t")
    check("avisos", "Revocado no envía", True, perm.format(u=U["REV"], a="send"), None, "service_role", must_contain="f")
    check("avisos", "authenticated no puede llamar al chequeo de servicio", False, perm.format(u=U["VWR"], a="send"), "VWR")

    # --- Dashboard ----------------------------------------------------------------------
    check("dashboard", "Viewer con dashboard.view lee vista reducida", True,
          "select coalesce(email,'(oculto)') from public.admin_dashboard_members();", "VWR", must_contain="(oculto)")
    check("dashboard", "Editor sin dashboard.view es rechazado", False, "select count(*) from public.admin_dashboard_members();", "EDT")
    check("dashboard", "Sin rol (solo read_only automático) NO ve el dashboard", True,
          "select public.has_admin_module_permission('dashboard','view');", "LEG", must_contain="f")
    check("dashboard", "Sin rol: RPC del dashboard rechazado", False, "select count(*) from public.admin_dashboard_members();", "LEG")
    check("dashboard", "Cuenta de revisión Apple conserva el dashboard", True,
          "select count(*) from public.admin_dashboard_members();", "APPREV", must_contain="1")
    check("dashboard", "Cuenta de revisión Apple no puede modificar nada", True,
          "select public.has_admin_module_permission('events','create');", "APPREV", must_contain="f")
    check("dashboard", "RX con dashboard denegado: RPC rechazado", False, "select count(*) from public.admin_dashboard_members();", "RX")
    check("dashboard", "RX con dashboard denegado NO lee unirse directo", True,
          "select count(*) from public.unirse;", "RX", must_contain="0")

    # --- Viewer bloqueado a solo lectura (C) ---------------------------------------------
    check("viewer", "SA no puede dar 'Crear eventos' al rol Viewer", False,
          f"select public.admin_save_role_permissions('{R['Viewer']}', array['events.view','events.create']::text[]);", "SA")
    check("viewer", "SA puede dar solo permisos de ver al Viewer", True,
          f"select public.admin_save_role_permissions('{R['Viewer']}', array['events.view','gallery.view']::text[]);", "SA")
    check("viewer", "SA no puede permitir 'Enviar avisos' a un Viewer por excepción", False,
          f"""select public.admin_save_user_overrides('{U['VWR']}', '{{"notices.send":true}}'::jsonb);""", "SA")
    check("viewer", "SA sí puede denegar a un Viewer por excepción", True,
          f"""select public.admin_save_user_overrides('{U['VWR']}', '{{"gallery.view":false}}'::jsonb);""", "SA")
    check("viewer", "Viewer no envía avisos (servidor)", True,
          f"select public.admin_user_has_permission('{U['VWR']}','notices','send');", None, "service_role", must_contain="f")
    check("viewer", "Manager no se ve afectado (sigue creando)", True,
          "select public.has_admin_module_permission('events','create');", "MGR_A", must_contain="t")

    # --- Hardening ------------------------------------------------------------------------
    check("hardening", "No se asigna rol a cuenta no autorizada (sin invitación)", False,
          f"select public.admin_assign_role('noauth@test.local','{R['Manager']}');", "SA")
    check("hardening", "Viewer (solo ver contenido) NO lee datos de inscritas", True,
          "select count(*) from public.inscripciones;", "VWR", must_contain="0")
    check("hardening", "Manager (editar contenido) lee inscritas", True,
          "select count(*) from public.inscripciones;", "MGR_A", must_contain="1")
    # Permission change during an active session: next statement already uses the new rule.
    check("sesion", "Cambio de permisos aplica en la sesión activa", False, f"""
      select set_config('request.jwt.claims', '{{"sub":"{U['SA']}","role":"authenticated"}}', true);
      select public.admin_save_user_overrides('{U['MGR_A']}', '{{"events.create":false}}'::jsonb);
      select set_config('request.jwt.claims', '{{"sub":"{U['MGR_A']}","role":"authenticated"}}', true);
      insert into public.eventos(id,titulo,horario,icono,link,activa,orden) values (19,'x','Lunes 10:00','x','https://x',true,9);""", "MGR_A")

    # --- Funcional: reemplazar imagen con permiso de editar -------------------------------
    check("funcional", "Editor de eventos (sin crear) puede subir icono nuevo al editar", True,
          "insert into storage.objects(bucket_id,name) values ('mcp930-images','eventos/i.webp');", "EDT_EVENTS")
    check("funcional", "Proceso de servidor (sin sesión) puede actualizar destacadas", True,
          "update public.destacadas set orden=5 where id='11111111-1111-1111-1111-111111111111' returning 1;", None, "service_role", must_contain="1")

    width = max(len(r[1]) for r in RESULTS)
    failed = 0
    for area, name, passed, ok, last in RESULTS:
        failed += not passed
        print(f"{'PASS' if passed else 'FAIL'}  [{area}] {name.ljust(width)}  ({'ok' if ok else 'error'}: {last})")
    print(f"\n{len(RESULTS) - failed}/{len(RESULTS)} PASS")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
