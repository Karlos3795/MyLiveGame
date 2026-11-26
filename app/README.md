# MISIONES — versión app (móvil y ordenador)

Aplicación instalable tipo **PWA**: se abre como una app (sin barra del
navegador), funciona **sin conexión** y guarda todos los datos **en el propio
dispositivo**. No necesita servidor ni cuenta.

## Probar en el ordenador

```bash
cd proyecto_personal
python3 app/servir.py
```

Se abre <http://127.0.0.1:8080>. En Chrome o Edge:

- Pulsa el botón **Instalar app** de la cabecera, o
- Menú del navegador → **Instalar MISIONES**.

Queda como una aplicación de escritorio con su icono y se abre en su propia
ventana. Al ser `localhost`, el navegador la considera segura y permite la
instalación y el modo sin conexión.

## Instalar en el móvil (Android / iPhone)

El móvil exige **HTTPS** para instalar una PWA. Publica la carpeta `app/` en
cualquier hosting estático gratuito (GitHub Pages, Netlify, Cloudflare Pages…)
y abre la URL en el móvil:

- **Android (Chrome):** menú → **Instalar app** / **Añadir a pantalla de inicio**.
- **iPhone/iPad (Safari):** botón **Compartir** → **Añadir a pantalla de inicio**.

La app queda con icono propio y, tras la primera visita, funciona sin conexión.

> También puedes abrir `app/index.html` directamente con doble clic. La app
> funciona y guarda datos, pero el navegador no permite instalar ni activar el
> modo sin conexión desde `file://`.

## Qué incluye esta versión

- Las mismas cuatro secciones, alta de misiones, fechas, botón **Completar** y
  contador que la versión web.
- **Almacenamiento local** (`localStorage`): no sale nada del dispositivo.
- **Descargar CSV** generado al momento, con las mismas columnas que la web.
- **Copia de seguridad** en JSON (exportar/importar) para cambiar de móvil,
  pasar datos a otro navegador o recuperarlos.
- **Sin conexión** gracias al service worker.
- Iconos, `manifest.webmanifest` y botón de instalación.

## Dónde están los datos

| Dato | Clave de `localStorage` |
|---|---|
| Misiones activas | `misiones.app.v1` |
| Misiones completadas | `misiones.app.v1.completadas` |

Cada navegador/dispositivo tiene sus propios datos: no se sincronizan solos.
Si borras los datos del sitio, se pierden; por eso existe la **copia de
seguridad**. El CSV de completadas también se puede descargar en cualquier
momento.

## Estructura

```
app/
├── index.html              # Interfaz + metadatos PWA
├── almacen.js              # localStorage, CSV y copias de seguridad
├── nucleo.js               # Interfaz (copiado desde ../comun/)
├── style.css               # Estilos (copiado desde ../comun/)
├── manifest.webmanifest    # Nombre, iconos, colores, modo app
├── sw.js                   # Service worker (caché sin conexión)
├── servir.py               # Servidor local opcional
└── iconos/
    ├── generar_iconos.py   # Regenera los PNG si cambias el diseño
    ├── icono-192.png
    ├── icono-512.png
    ├── icono-maskable-512.png
    ├── apple-touch-icon.png
    └── favicon-64.png
```

## Desarrollo

La interfaz es común a las dos versiones. Edita siempre en `comun/` y ejecuta:

```bash
python3 sincronizar.py
```

Ese script copia `nucleo.js` y `style.css` a `web/static/` y a `app/`, y
actualiza la versión de caché de `sw.js` para que los navegadores recojan los
cambios.

## Costes

Todo lo que hay hecho aquí es **gratuito** y no requiere registrar ninguna
cuenta. No se ha pagado nada.

| Cosa | Coste | ¿Hace falta ahora? |
|---|---|---|
| Python, HTML/CSS/JS, PWA | Gratis | Sí (ya incluido) |
| Hosting estático (GitHub Pages, Netlify, Cloudflare Pages) | Gratis | Solo para instalar en el móvil |
| Servir en local con `servir.py` | Gratis | Sí |
| Empaquetar escritorio con Tauri o Electron | Gratis (open source) | Opcional |
| Generar un APK de Android con Capacitor o Bubblewrap | Gratis | Opcional |
| Publicar en Google Play | **25 USD pago único** | Solo si quieres estar en la tienda |
| Publicar en App Store / distribuir en iPhone | **99 USD/año** (Apple Developer) | Solo para tienda o firma iOS |
| Certificado de firma para Windows | ~100–400 USD/año | Opcional (sin él, SmartScreen avisa) |
| Dominio propio | ~10–15 USD/año | Opcional (los hostings gratuitos dan subdominio) |

Nada de esto se ha contratado. Si más adelante quieres APK para Android o un
instalador `.exe`/`.dmg`, se puede hacer con herramientas gratuitas; solo las
tiendas y los certificados de firma son de pago.
