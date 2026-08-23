# Sincronización manual de Gmail: configuración en Google Cloud Console

Esto es aparte del sync automático por IMAP que ya corre solo cada 30
minutos (Gmail + Outlook). Es una fuente adicional para forzar una lectura
inmediata de Gmail desde la app, sin esperar al próximo ciclo. Ninguno de
estos pasos los puede hacer Claude Code por vos: requieren tu propia cuenta
de Google.

## 1. Crear el proyecto y la pantalla de consentimiento

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) con
   la cuenta de Google que querés que la app pueda leer.
2. Creá un proyecto nuevo (cualquier nombre, ej. "Finanzas").
3. Menú ☰ → **APIs & Services** → **OAuth consent screen**.
4. Tipo de usuario: **External**. Completá nombre de la app, tu correo de
   soporte y tu correo de contacto del desarrollador.
5. En **Scopes**, agregá `https://www.googleapis.com/auth/gmail.readonly`.
6. En **Test users**, agregá tu propia cuenta de Gmail. Mientras la app
   quede en estado "Testing" (no la publicás para el público), solo las
   cuentas que agregues acá pueden autenticarse — es justo lo que hace
   falta para uso personal, sin pasar por la revisión de Google.
7. Guardá.

## 2. Habilitar la API de Gmail

Menú ☰ → **APIs & Services** → **Library** → buscá "Gmail API" → **Enable**.

## 3. Crear el OAuth Client ID de tipo Android

1. **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**.
2. Tipo de aplicación: **Android**.
3. Nombre del paquete: `com.technoverse93.appdefinanza`
4. Huella SHA-1: copiá exactamente este valor (es la huella del keystore
   fijo que ya se agregó al pipeline de build, así no cambia en cada
   compilación):

   ```
   C1:F1:38:53:C4:13:56:13:80:62:EB:B7:20:3F:8B:D5:51:9B:50:94
   ```

5. Creá el cliente. Google te muestra un **Client ID** (termina en
   `.apps.googleusercontent.com`) — copiá ese valor completo.

## 4. Agregar los secretos en GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**, uno por uno:

**Nombre 1:**
```
ANDROID_DEBUG_KEYSTORE_BASE64
```
**Valor 1** (el keystore fijo, en base64 — pegalo tal cual, es una sola
línea larga):
```
MIIEqwIB…(pedíselo a Claude en el chat si no lo tenés a mano; se generó en esta sesión)
```

**Nombre 2:**
```
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
```
**Valor 2:** el Client ID que copiaste en el paso 3 (termina en
`.apps.googleusercontent.com`).

## 5. Probar

Una vez agregados los dos secretos, pedile a Claude que dispare un build
nuevo. Cuando instales el APK nuevo, en la pestaña Deudas debería aparecer
una tarjeta "Gmail" con el botón "Conectar y sincronizar Gmail".

La primera vez te va a pedir iniciar sesión con Google y aceptar el
permiso de solo lectura de Gmail — asegurate de iniciar sesión con la
cuenta que agregaste como "Test user" en el paso 1, si no Google va a
rechazar el login con un aviso de "app no verificada".
