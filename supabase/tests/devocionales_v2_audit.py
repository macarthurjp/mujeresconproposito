#!/usr/bin/env python3
"""Local audit for 20261119100000_devocional_editorial_v2.sql.

Reuses the rbac_audit.py setup (same LOCAL database, never a remote one) and
adds two reviewers:
  REVW  Editor role + "devotionals.publish" exception  -> view, create, edit, publish (still cannot edit others)
  REVO  custom role "Revisora" with view + publish only (no edit)
Each check runs in its own rolled-back transaction; multi-step flows switch
the simulated user with as_() inside one check.

Usage: PSQL="psql -h 127.0.0.1 -p 55422 -U postgres -d postgres" python3 devocionales_v2_audit.py
"""
import subprocess
import sys

import rbac_audit as base
from rbac_audit import PSQL, RESULTS, U, check, sa

U["REVW"] = "00000000-0000-0000-0000-0000000000a7"
U["REVO"] = "00000000-0000-0000-0000-0000000000a8"


def as_(user):
    return f"select set_config('request.jwt.claims', '{{\"sub\":\"{U[user]}\",\"role\":\"authenticated\",\"email\":\"{user.lower()}@test.local\"}}', true);"


def outbox(event, devotional_id):
    # The outbox is private: read it as the table owner, inside the same transaction.
    return f"reset role; select count(*) from public.devocional_email_outbox where event_type='{event}' and devotional_id={devotional_id};"


def psql(sql):
    p = subprocess.run(PSQL + ["-q", "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True)
    if p.returncode:
        sys.exit("SETUP FAILED: " + p.stderr)


def setup():
    ids = base.setup()
    psql(f"""
      -- (auth.users rows for REVW/REVO are created by rbac_audit.setup from U)
      insert into public.user_roles(user_id,email,nombre,is_super_admin,permissions,is_revoked)
        values ('{U['REVW']}','revw@test.local','Revisora W',false,'{{read_only}}',false),
               ('{U['REVO']}','revo@test.local','Revisora O',false,'{{read_only}}',false)
        on conflict (user_id) do update set nombre=excluded.nombre;
    """)
    sa(f"select public.admin_assign_role('revw@test.local','{ids['Editor']}');")
    sa(f"""select public.admin_save_user_overrides('{U['REVW']}', '{{"devotionals.publish":true}}'::jsonb);""")
    rev = sa("select public.admin_save_role('Revisora','Revisa sin editar');").splitlines()[-1]
    sa(f"select public.admin_save_role_permissions('{rev}', array['devotionals.view','devotionals.publish']::text[]);")
    sa(f"select public.admin_assign_role('revo@test.local','{rev}');")
    # Fixtures (committed): 500 = EDT draft, 501 = EDT live article, 502 = SA draft.
    base.run(f"""insert into public.devocionales(id,slug,created_by,pending_content)
      values (500,'borrador-edt','{U['EDT']}','{{"titulo":"Borrador","contenido":"Reflexión"}}');""", "EDT", commit=True)
    # A live article by EDT, as it exists in production (no user may insert on someone else's behalf).
    psql(f"""set session_replication_role = replica;
      insert into public.devocionales(id,slug,created_by,titulo,contenido,publicado,fecha_publicacion,autora,estado)
      values (501,'publicado-edt','{U['EDT']}','Publicado','Texto',true,'2026-01-01','E','publicado');""")
    sa(f"""insert into public.devocionales(id,slug,created_by,pending_content)
      values (502,'borrador-sa','{U['SA']}','{{"titulo":"De SA","contenido":"Reflexión SA"}}');""")
    return ids


def main():
    setup()
    submit500 = as_("EDT") + " select public.devocional_submit_for_review(500);"
    claim500 = submit500 + as_("REVW") + " select public.devocional_claim_review(500);"

    # --- Autora ---------------------------------------------------------------------------
    check("autora", "Crea borrador con pending_content", True,
          f"insert into public.devocionales(id,slug,created_by,pending_content) values (510,'n','{U['EDT']}','{{\"titulo\":\"t\",\"contenido\":\"c\"}}');", "EDT")
    check("autora", "No crea un artículo ya publicado", False,
          f"insert into public.devocionales(id,slug,created_by,titulo,publicado) values (511,'p','{U['EDT']}','t',true);", "EDT")
    check("autora", "Edita la copia pendiente de su borrador", True,
          """update public.devocionales set pending_content='{"titulo":"B2","contenido":"R2"}' where id=500 returning 1;""", "EDT", must_contain="1")
    check("autora", "No cambia la versión publicada directamente", False,
          "update public.devocionales set titulo='hack' where id=501;", "EDT")
    check("autora", "Propone cambios a su artículo publicado (sigue en línea)", True,
          """update public.devocionales set pending_content='{"titulo":"Publicado v2","contenido":"Texto v2"}' where id=501;
             select publicado::text||estado from public.devocionales where id=501;""", "EDT", must_contain="truepublicado")
    check("autora", "Envía a revisión -> pendiente_revision", True,
          submit500 + " select estado from public.devocionales where id=500;", "EDT", must_contain="pendiente_revision")
    check("autora", "No edita mientras está pendiente", False,
          submit500 + """ update public.devocionales set pending_content='{"titulo":"x","contenido":"y"}' where id=500;""", "EDT")
    check("autora", "Retira su envío -> borrador", True,
          submit500 + " select public.devocional_withdraw(500); select estado from public.devocionales where id=500;", "EDT", must_contain="borrador")
    check("autora", "No toma su propia revisión", False, submit500 + " select public.devocional_claim_review(500);", "EDT")
    check("autora", "No aprueba su propio artículo", False, submit500 + " select public.devocional_approve_and_publish(500);", "EDT")
    check("autora", "Editora sin permiso de borrar no elimina", False, "select public.devocional_soft_delete(500);", "EDT")

    # --- Revisora --------------------------------------------------------------------------
    check("revisora", "Ve la cola de otras autoras", True,
          submit500 + as_("REVW") + " select count(*) from public.devocionales where id=500;", "EDT", must_contain="1")
    check("revisora", "No ve borradores ajenos fuera de la cola", True,
          "select count(*) from public.devocionales where id=500;", "REVW", must_contain="0")
    check("revisora", "Viewer no ve la cola", True,
          submit500 + as_("VWR") + " select count(*) from public.devocionales where id=500;", "EDT", must_contain="0")
    check("revisora", "Toma la revisión -> en_revision", True,
          claim500 + " select estado from public.devocionales where id=500;", "EDT", must_contain="en_revision")
    check("revisora", "Al tomarla, la autora recibe un correo", True, claim500 + outbox("revision_tomada", 500), "EDT", must_contain="1")
    check("revisora", "No modifica el texto de la autora, aunque tenga 'editar' (0 filas)", True,
          claim500 + """ with u as (update public.devocionales set pending_content='{"titulo":"Revisado","contenido":"R"}' where id=500 returning 1)"""
          + " select 'filas='||count(*) from u;", "EDT", must_contain="filas=0")
    check("revisora", "Revisora sin 'editar' toma pero no edita (0 filas)", True,
          submit500 + as_("REVO") + " select public.devocional_claim_review(500);"
          + """ with u as (update public.devocionales set pending_content='{"titulo":"x","contenido":"y"}' where id=500 returning 1)"""
          + " select 'filas='||count(*) from u;", "EDT", must_contain="filas=0")
    check("revisora", "Revisora sin 'editar' sí aprueba", True,
          submit500 + as_("REVO") + " select public.devocional_claim_review(500); select public.devocional_approve_and_publish(500);"
          + " select publicado from public.devocionales where id=500;", "EDT", must_contain="t")
    check("revisora", "No aprueba sin tomar la revisión", False,
          submit500 + as_("REVW") + " select public.devocional_approve_and_publish(500);", "EDT")
    check("revisora", "Pedir cambios exige una nota", False, claim500 + " select public.devocional_request_changes(500,'  ');", "EDT")
    check("revisora", "Pide cambios -> la autora recibe la nota", True,
          claim500 + " select public.devocional_request_changes(500,'Revisa el versículo');" + outbox("cambios_solicitados", 500),
          "EDT", must_contain="1")
    check("revisora", "Aprueba -> publicado y correo a la autora", True,
          claim500 + " select public.devocional_approve_and_publish(500);" + outbox("aprobado_publicado", 500)
          + " select estado||publicado::text from public.devocionales where id=500;", "EDT", must_contain="publicadotrue")
    check("revisora", "Texto alternativo = título si falta", True,
          claim500 + " select public.devocional_approve_and_publish(500); select cover_alt from public.devocionales where id=500;",
          "EDT", must_contain="Borrador")
    check("revisora", "Programa -> programado y luego se publica solo", True,
          claim500 + " select public.devocional_approve_and_publish(500, now() + interval '1 day');"
          + " reset role; select set_config('app.devocional_guard_bypass','on',true);"
          + " update public.devocionales set scheduled_at=now()-interval '1 minute' where id=500;"
          + " select set_config('app.devocional_guard_bypass','off',true);"
          + " select public.devocional_publish_due(); select estado||publicado::text from public.devocionales where id=500;",
          "EDT", must_contain="publicadotrue")
    check("revisora", "Cambio aprobado a un publicado mantiene su fecha", True,
          """update public.devocionales set pending_content='{"titulo":"Publicado v2","contenido":"Texto v2"}' where id=501;"""
          " select public.devocional_submit_for_review(501);" + as_("REVW")
          + " select public.devocional_claim_review(501); select public.devocional_approve_and_publish(501);"
          " select titulo||'|'||publicado::text||'|'||to_char(fecha_publicacion,'YYYY') from public.devocionales where id=501;",
          "EDT", must_contain="Publicado v2|true|2026")
    check("revisora", "Libera la revisión -> vuelve a la cola", True,
          claim500 + " select public.devocional_release_review(500); select estado from public.devocionales where id=500;",
          "EDT", must_contain="pendiente_revision")

    # --- Super Admin -----------------------------------------------------------------------
    check("superadmin", "Publica directamente un artículo nuevo", True,
          f"insert into public.devocionales(id,slug,created_by,titulo,contenido,publicado,fecha_publicacion) values (520,'sa','{U['SA']}','t','c',true,now());"
          " select estado from public.devocionales where id=520;", "SA", must_contain="publicado")
    check("superadmin", "Edita directamente el artículo de otra autora", True,
          "update public.devocionales set titulo='Corregido' where id=501 returning 1;", "SA", must_contain="1")
    check("superadmin", "Publica el borrador de otra autora sin revisión", True,
          "select public.devocional_approve_and_publish(500); select publicado from public.devocionales where id=500;", "SA", must_contain="t")
    check("superadmin", "Puede enviar su propio artículo a revisión", True,
          "select public.devocional_submit_for_review(502); select estado from public.devocionales where id=502;", "SA", must_contain="pendiente_revision")
    check("superadmin", "Una revisora revisa el artículo del Super Admin", True,
          "select public.devocional_submit_for_review(502);" + as_("REVW") + " select public.devocional_claim_review(502);"
          " select public.devocional_approve_and_publish(502); select publicado from public.devocionales where id=502;", "SA", must_contain="t")
    check("superadmin", "Sin correo cuando el autor hace el cambio", True,
          "select public.devocional_approve_and_publish(502);" + outbox("aprobado_publicado", 502), "SA", must_contain="0")
    check("superadmin", "Despublica y la autora recibe aviso", True,
          "select public.devocional_unpublish(501);" + outbox("despublicado", 501), "SA", must_contain="1")
    check("superadmin", "Elimina (reversible) un artículo publicado", True,
          "select public.devocional_soft_delete(501); select estado||'|'||(deleted_at is not null)::text from public.devocionales where id=501;",
          "SA", must_contain="eliminado|true")

    # --- Público y otros -------------------------------------------------------------------
    check("publico", "Viewer con sesión lee devocionales publicados", True,
          "select count(*) from public.devocionales where id=501;", "VWR", must_contain="1")
    check("publico", "Anónimo no puede tomar revisiones", False, "select public.devocional_claim_review(500);", None, "anon")
    check("publico", "Nadie con sesión ejecuta la publicación programada", False, "select public.devocional_publish_due();", "SA")
    check("publico", "La bandeja de correos es privada", False, "select * from public.devocional_email_outbox;", "SA")

    width = max(len(r[1]) for r in RESULTS)
    failed = 0
    for area, name, passed, ok, last in RESULTS:
        failed += not passed
        print(f"{'PASS' if passed else 'FAIL'}  [{area}] {name.ljust(width)}  ({'ok' if ok else 'error'}: {last})")
    print(f"\n{len(RESULTS) - failed}/{len(RESULTS)} PASS")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
