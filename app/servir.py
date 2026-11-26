#!/usr/bin/env python3
"""Sirve la versión APP en local para instalarla o probarla.

Solo usa la librería estándar de Python. Abre el navegador en:
    http://127.0.0.1:8080

Al servirse desde localhost, Chrome/Edge permiten instalar la app
(menú del navegador -> "Instalar app"). En el móvil, publica esta carpeta
en un hosting estático con HTTPS y usa "Añadir a pantalla de inicio".
"""

import http.server
import os
import threading
import webbrowser
from functools import partial

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUERTO_INICIAL = int(os.environ.get("PORT", "8080"))


class Handler(http.server.SimpleHTTPRequestHandler):
    """Sirve archivos con los MIME correctos y sin caché (útil en desarrollo)."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, formato, *args):
        print("[%s] %s" % (self.log_date_time_string(), formato % args))


def crear_servidor():
    for puerto in range(PUERTO_INICIAL, PUERTO_INICIAL + 20):
        try:
            servidor = http.server.ThreadingHTTPServer(
                ("127.0.0.1", puerto), partial(Handler, directory=BASE_DIR)
            )
            return servidor, puerto
        except OSError:
            continue
    raise SystemExit("No hay ningún puerto libre entre %s y %s." % (
        PUERTO_INICIAL, PUERTO_INICIAL + 19
    ))


def main():
    servidor, puerto = crear_servidor()
    url = "http://127.0.0.1:%d" % puerto
    print("MISIONES (app) en %s" % url)
    print("Pulsa Ctrl+C para detenerlo.")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
