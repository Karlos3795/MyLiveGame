# MISIONES

Convierte tus tareas en misiones de videojuego. El proyecto tiene **dos
versiones independientes** que comparten la misma interfaz:

| Versión | Carpeta | Datos | Cómo se usa |
|---|---|---|---|
| **Web** | `web/` | Servidor Python (`data/misiones.json` + CSV) | `python3 web/server.py` |
| **App** | `app/` | Almacenamiento local del dispositivo (`localStorage`) | `python3 app/servir.py` o instalada como PWA |

Las dos permiten crear misiones en las secciones **Principales**,
**Secundarias**, **De Campo** y **Diarias**, completarlas, ver el contador y
descargar el CSV de completadas. Al crear una misión también se pueden activar
avisos para sus fechas de inicio/fin; los ajustes avanzados incluyen el acceso
preparado para añadir fases posteriormente.

## Arrancar la versión web

```bash
cd proyecto_personal
python3 web/server.py
```

Abre <http://127.0.0.1:8000>. Datos en `web/data/`.

## Arrancar / instalar la versión app

```bash
cd proyecto_personal
python3 app/servir.py
```

Abre <http://127.0.0.1:8080>. En Chrome/Edge aparecerá la opción de
**Instalar app** (también hay un botón dentro de la app).

La app guarda todo en el propio dispositivo, funciona **sin conexión** y
permite **exportar/importar una copia de seguridad** en JSON. En el móvil se
instala desde el navegador una vez publicada en un hosting con HTTPS. Detalles
y costes en [`app/README.md`](app/README.md).

## Estructura

```
proyecto_personal/
├── comun/                  # Código compartido (fuente de la interfaz)
│   ├── nucleo.js           # Lógica y render de la interfaz
│   └── style.css           # Estilos
├── web/                    # Versión web con servidor
│   ├── server.py
│   ├── static/
│   │   ├── index.html      # HTML propio de la web
│   │   ├── almacen.js      # Adaptador: API del servidor
│   │   ├── nucleo.js       # (copiado desde comun/)
│   │   └── style.css       # (copiado desde comun/)
│   └── data/
│       ├── misiones.json
│       └── misiones_completadas.csv
├── app/                    # Versión app instalable (PWA)
│   ├── index.html          # HTML propio de la app
│   ├── almacen.js          # Adaptador: localStorage + CSV + copias
│   ├── nucleo.js           # (copiado desde comun/)
│   ├── style.css           # (copiado desde comun/)
│   ├── manifest.webmanifest
│   ├── sw.js               # Service worker (funciona sin conexión)
│   ├── servir.py           # Servidor local opcional
│   └── iconos/
├── sincronizar.py          # Copia comun/ a las dos versiones
├── prompt.txt
└── README.md
```

### Por qué hay archivos duplicados

`web/` y `app/` deben poder funcionar por separado (la app incluso sin
servidor). Por eso cada una tiene su copia de `nucleo.js` y `style.css`.

**Flujo para desarrollar ambas a la vez:**

1. Edita `comun/nucleo.js` o `comun/style.css`.
2. Ejecuta `python3 sincronizar.py`.
3. Prueba `web/` y `app/`; el script también sincroniza los archivos comunes y
   el almacenamiento de la PWA publicada en `docs/`, y renueva su caché.

Lo único específico de cada versión es su `index.html` y su `almacen.js`.
Si añades una función nueva a la interfaz, va en `comun/nucleo.js`; si
necesita datos, añade el método a **los dos** `almacen.js`.

## Diferencias de almacenamiento

- **Web:** las misiones activas se guardan en `web/data/misiones.json` y las
  completadas se añaden a `web/data/misiones_completadas.csv`.
- **App:** las misiones activas y las completadas viven en `localStorage` del
  navegador. El CSV se genera al vuelo al pulsar "Descargar CSV".

## Costes

Todo lo implementado usa herramientas gratuitas. No se ha contratado ni
registrado nada de pago. Las únicas cosas opcionales que cuestan dinero son
las tiendas de aplicaciones (Google Play y App Store) y los certificados de
firma; están detalladas en [`app/README.md`](app/README.md#costes).

### Avisos de fecha

El navegador debe tener permiso para mostrar notificaciones. La app comprueba
las fechas cuando está abierta y avisa ese día; como esta PWA no usa un servidor
de notificaciones push, no puede garantizar avisos si está cerrada o el
dispositivo está apagado.
