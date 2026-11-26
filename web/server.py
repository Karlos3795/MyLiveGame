#!/usr/bin/env python3
"""Servidor minimo para el prototipo "Misiones".

Sin dependencias externas: solo la libreria estandar de Python.
Sirve la interfaz web y guarda las misiones completadas en un CSV.
"""

import csv
import json
import os
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATA_DIR = os.path.join(BASE_DIR, "data")
MISIONES_JSON = os.path.join(DATA_DIR, "misiones.json")
CSV_PATH = os.path.join(DATA_DIR, "misiones_completadas.csv")

TIPOS = ("principales", "secundarias", "campo", "diarias")

# Orden exacto de columnas pedido para el CSV.
CSV_HEADER = [
    "titulo",
    "descripcion",
    "fecha_inicio",
    "fecha_fin",
    "completada",
    "fecha_completada",
]

_lock = threading.Lock()


def _asegurar_directorios():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(MISIONES_JSON):
        with open(MISIONES_JSON, "w", encoding="utf-8") as f:
            json.dump({t: [] for t in TIPOS}, f, ensure_ascii=False, indent=2)


def cargar_misiones():
    with _lock:
        with open(MISIONES_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    for t in TIPOS:
        data.setdefault(t, [])
    return data


def guardar_misiones(data):
    with _lock:
        tmp = MISIONES_JSON + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, MISIONES_JSON)


def añadir_al_csv(mision):
    nuevo = not os.path.exists(CSV_PATH) or os.path.getsize(CSV_PATH) == 0
    with _lock:
        with open(CSV_PATH, "a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if nuevo:
                writer.writerow(CSV_HEADER)
            writer.writerow(
                [
                    mision.get("titulo", ""),
                    mision.get("descripcion", ""),
                    mision.get("fecha_inicio", ""),
                    mision.get("fecha_fin", ""),
                    "true",
                    mision.get("fecha_completada", ""),
                ]
            )


def contar_completadas():
    if not os.path.exists(CSV_PATH):
        return 0
    with _lock:
        with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
            return max(0, sum(1 for _ in csv.reader(f)) - 1)


class Handler(BaseHTTPRequestHandler):
    server_version = "Misiones/1.0"

    # ---------- utilidades ----------
    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, mensaje, status=400):
        self._json({"ok": False, "error": mensaje}, status)

    def _leer_json(self):
        try:
            largo = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            largo = 0
        if largo <= 0 or largo > 100_000:
            return {}
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def _servir_estatico(self, ruta):
        if ruta in ("/", ""):
            ruta = "/index.html"
        ruta = ruta.split("?", 1)[0]
        candidato = os.path.normpath(os.path.join(STATIC_DIR, ruta.lstrip("/")))
        if not candidato.startswith(STATIC_DIR + os.sep) or not os.path.isfile(candidato):
            self.send_error(404, "No encontrado")
            return
        tipos = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }
        ext = os.path.splitext(candidato)[1].lower()
        with open(candidato, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", tipos.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- rutas ----------
    def do_GET(self):
        ruta = urlparse(self.path).path
        if ruta == "/api/misiones":
            self._json(
                {
                    "ok": True,
                    "misiones": cargar_misiones(),
                    "completadas": contar_completadas(),
                }
            )
            return
        if ruta == "/api/csv":
            if not os.path.exists(CSV_PATH):
                self.send_error(404, "Todavia no hay misiones completadas")
                return
            with _lock:
                with open(CSV_PATH, "rb") as f:
                    body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header(
                "Content-Disposition", 'attachment; filename="misiones_completadas.csv"'
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._servir_estatico(ruta)

    def do_POST(self):
        ruta = urlparse(self.path).path
        datos = self._leer_json()

        if ruta == "/api/misiones":
            tipo = str(datos.get("tipo", "")).strip()
            titulo = str(datos.get("titulo", "")).strip()
            if tipo not in TIPOS:
                self._error("Tipo de mision no valido")
                return
            if not titulo:
                self._error("El titulo es obligatorio")
                return
            fecha_inicio = str(datos.get("fecha_inicio", "")).strip()[:10]
            fecha_fin = str(datos.get("fecha_fin", "")).strip()[:10]
            fecha_hoy_local = str(datos.get("fecha_hoy_local", "")).strip()[:10]
            for etiqueta, valor in (("inicio", fecha_inicio), ("fin", fecha_fin)):
                if valor:
                    try:
                        fecha_parseada = datetime.strptime(valor, "%Y-%m-%d")
                    except ValueError:
                        self._error(f"La fecha {etiqueta} no es válida")
                        return
                    if fecha_parseada.strftime("%Y-%m-%d") != valor:
                        self._error(f"La fecha {etiqueta} no es válida")
                        return
            if fecha_hoy_local:
                try:
                    fecha_hoy_parseada = datetime.strptime(fecha_hoy_local, "%Y-%m-%d")
                except ValueError:
                    self._error("La fecha local de hoy no es válida")
                    return
                if fecha_hoy_parseada.strftime("%Y-%m-%d") != fecha_hoy_local:
                    self._error("La fecha local de hoy no es válida")
                    return
            else:
                fecha_hoy_local = datetime.now().date().isoformat()
            if fecha_inicio and fecha_inicio < fecha_hoy_local:
                self._error("La fecha inicio no puede ser anterior a hoy")
                return
            if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
                self._error("La fecha fin no puede ser anterior a la fecha inicio")
                return
            mision = {
                "id": uuid.uuid4().hex[:10],
                "titulo": titulo[:160],
                "descripcion": str(datos.get("descripcion", "")).strip()[:1000],
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "notificar_inicio": bool(datos.get("notificar_inicio", False)),
                "notificar_fin": bool(datos.get("notificar_fin", False)),
                "notificado_inicio": "",
                "notificado_fin": "",
                "creada": datetime.now().isoformat(timespec="seconds"),
            }
            data = cargar_misiones()
            data[tipo].append(mision)
            guardar_misiones(data)
            self._json({"ok": True, "mision": mision}, 201)
            return

        if ruta == "/api/misiones/notificada":
            tipo = str(datos.get("tipo", "")).strip()
            mid = str(datos.get("id", "")).strip()
            extremo = str(datos.get("extremo", "")).strip()
            fecha = str(datos.get("fecha", "")).strip()[:10]
            if tipo not in TIPOS or extremo not in ("inicio", "fin") or not fecha:
                self._error("Datos de notificación no válidos")
                return
            data = cargar_misiones()
            encontrada = next((m for m in data[tipo] if m.get("id") == mid), None)
            if encontrada is None:
                self._error("Misión no encontrada", 404)
                return
            encontrada["notificado_" + extremo] = fecha
            guardar_misiones(data)
            self._json({"ok": True})
            return

        if ruta == "/api/misiones/completar":
            tipo = str(datos.get("tipo", "")).strip()
            mid = str(datos.get("id", "")).strip()
            if tipo not in TIPOS:
                self._error("Tipo de mision no valido")
                return
            data = cargar_misiones()
            encontrada = None
            for m in data[tipo]:
                if m.get("id") == mid:
                    encontrada = m
                    break
            if encontrada is None:
                self._error("Mision no encontrada", 404)
                return
            encontrada["fecha_completada"] = datetime.now().isoformat(timespec="seconds")
            añadir_al_csv(encontrada)
            data[tipo].remove(encontrada)
            guardar_misiones(data)
            self._json(
                {"ok": True, "completadas": contar_completadas()}, 200
            )
            return

        self._error("Ruta no encontrada", 404)

    def log_message(self, formato, *args):
        print("[%s] %s" % (self.log_date_time_string(), formato % args))


def main():
    _asegurar_directorios()
    puerto = int(os.environ.get("PORT", "8000"))
    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Handler)
    print(f"Servidor de Misiones en http://127.0.0.1:{puerto}")
    print("Pulsa Ctrl+C para detenerlo.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
