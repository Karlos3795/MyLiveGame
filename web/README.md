# MISIONES — versión web

Prototipo con servidor local. No necesita dependencias externas: solo
Python 3 y el navegador.

## Arrancar

```bash
cd proyecto_personal
python3 web/server.py
```

Abre <http://127.0.0.1:8000>. Para otro puerto:

```bash
PORT=8080 python3 web/server.py
```

## Qué incluye

- Cuatro secciones: **Principales**, **Secundarias**, **De Campo** y **Diarias**.
- Alta de misiones con **título** (obligatorio), **descripción** y **fechas de
  inicio/fin** (opcionales).
- Botón **Completar**: archiva la misión y la guarda en el CSV.
- Contador de completadas y descarga directa del CSV.
- Las misiones activas se conservan entre reinicios en `web/data/misiones.json`.

## API

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/misiones` | Lista de activas + contador de completadas |
| `GET` | `/api/csv` | Descarga `misiones_completadas.csv` |
| `POST` | `/api/misiones` | Crea una misión |
| `POST` | `/api/misiones/completar` | Archiva una misión |

## CSV de misiones completadas

Se escribe en `web/data/misiones_completadas.csv` con este orden de columnas:

```
titulo,descripcion,fecha_inicio,fecha_fin,completada,fecha_completada
```

`completada` siempre vale `true` y `fecha_completada` es la marca temporal del
momento en que se pulsó el botón.

## Archivos

```
web/
├── server.py            # servidor HTTP + API + escritura del CSV
├── static/
│   ├── index.html       # HTML propio de la versión web
│   ├── almacen.js       # Adaptador contra la API
│   ├── nucleo.js        # Interfaz (copiado desde ../comun/)
│   └── style.css        # Estilos (copiado desde ../comun/)
└── data/
    ├── misiones.json
    └── misiones_completadas.csv
```

> `nucleo.js` y `style.css` se editan en `comun/` y se copian con
> `python3 sincronizar.py` desde la raíz del proyecto.
