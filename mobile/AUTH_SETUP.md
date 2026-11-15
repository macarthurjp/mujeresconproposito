# Acceso social para los paneles

La app usa Supabase Auth desde su login nativo. Apple y Google regresan a `mcp930://auth/callback`; el login no carga `admin.html` ni `dashboard.html`. En la web, los proveedores vuelven a la página de panel donde se inició el acceso.

Para habilitar esos botones en el proyecto Supabase:

1. Activa Apple y Google en **Authentication → Sign In / Providers** y agrega las credenciales OAuth de cada proveedor.
2. Añade estas rutas a **Authentication → URL Configuration → Redirect URLs**:
   - `mcp930://auth/callback`
   - `https://mcp930.org/admin.html`
   - `https://mcp930.org/dashboard.html`
3. En Google y Apple, registra como URL de retorno OAuth `https://jkunywiyiyidhyodsbfh.supabase.co/auth/v1/callback`.
4. Para Apple web OAuth, crea un Services ID y colócalo primero en Client IDs, seguido por `org.mcp930.app` para iOS.
5. Prueba el retorno nativo en un development build con el scheme `mcp930`.

Las cuentas sociales sin permisos activos para el panel se cierran después del retorno. Las credenciales privadas de los proveedores permanecen en Supabase; no se guardan en la app.
