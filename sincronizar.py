#!/usr/bin/env python3
"""Copia el código compartido (interfaz y estilos) a las versiones del proyecto.

Flujo de desarrollo:
  1. Edita `comun/style.css` o `comun/nucleo.js`.
  2. Ejecuta `python3 sincronizar.py`.
  3. Prueba `web/` y `app/` (y publica `docs/` si corresponde).

Así la versión web y la app mantienen la misma interfaz. La carpeta `docs/`
recibe una copia completa de la PWA para su publicación pública.
"""

import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
COMPARTIDOS = ("style.css", "nucleo.js")
DESTINOS = (
    os.path.join(BASE, "web", "static"),
    os.path.join(BASE, "app"),
    os.path.join(BASE, "docs"),  # copia PWA publicada (p. ej. GitHub Pages)
)


def leer(ruta):
    with open(ruta, "rb") as f:
        return f.read()


def escribir_si_cambia(ruta, contenido):
    if os.path.exists(ruta) and leer(ruta) == contenido:
        return False
    with open(ruta, "wb") as f:
        f.write(contenido)
    return True


def actualizar_cache_sw(huella):
    actualizados = []
    for carpeta in ("app", "docs"):
        ruta = os.path.join(BASE, carpeta, "sw.js")
        if not os.path.exists(ruta):
            continue
        with open(ruta, "r", encoding="utf-8") as f:
            codigo = f.read()
        nuevo, cambios = re.subn(
            r'const CACHE = "mylivegame-app-[^"]*";',
            'const CACHE = "mylivegame-app-%s";' % huella,
            codigo,
        )
        if cambios and nuevo != codigo:
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(nuevo)
            actualizados.append(carpeta)
    return actualizados


def main():
    if not os.path.isdir(os.path.join(BASE, "comun")):
        raise SystemExit("No encuentro la carpeta comun/.")

    hash_total = hashlib.sha256()
    for nombre in COMPARTIDOS:
        origen = os.path.join(BASE, "comun", nombre)
        if not os.path.exists(origen):
            raise SystemExit("Falta comun/%s" % nombre)
        contenido = leer(origen)
        hash_total.update(contenido)
        for destino in DESTINOS:
            ruta = os.path.join(destino, nombre)
            if escribir_si_cambia(ruta, contenido):
                print("Actualizado", os.path.relpath(ruta, BASE))
            else:
                print("Sin cambios", os.path.relpath(ruta, BASE))

    # docs/ es la publicación de GitHub Pages; sincroniza el paquete completo.
    archivos_app = ("index.html", "almacen.js", "manifest.webmanifest", "sw.js")
    for nombre in archivos_app:
        origen = os.path.join(BASE, "app", nombre)
        destino = os.path.join(BASE, "docs", nombre)
        if escribir_si_cambia(destino, leer(origen)):
            print("Actualizado", os.path.relpath(destino, BASE))

    iconos = (
        "icono-192.png", "icono-512.png", "icono-maskable-512.png",
        "apple-touch-icon.png", "favicon-64.png",
    )
    destino_iconos = os.path.join(BASE, "docs", "iconos")
    os.makedirs(destino_iconos, exist_ok=True)
    for nombre in iconos:
        origen = os.path.join(BASE, "app", "iconos", nombre)
        destino = os.path.join(destino_iconos, nombre)
        if escribir_si_cambia(destino, leer(origen)):
            print("Actualizado", os.path.relpath(destino, BASE))
    web_favicon = os.path.join(BASE, "web", "static", "favicon-64.png")
    icono_favicon = os.path.join(BASE, "app", "iconos", "favicon-64.png")
    if escribir_si_cambia(web_favicon, leer(icono_favicon)):
        print("Actualizado", os.path.relpath(web_favicon, BASE))

    # La caché del service worker cambia cuando cambia la interfaz.
    for extra in (
        "app/index.html", "app/almacen.js", "app/manifest.webmanifest",
        *[os.path.join("app", "iconos", nombre) for nombre in iconos],
    ):
        ruta = os.path.join(BASE, extra)
        if os.path.exists(ruta):
            hash_total.update(leer(ruta))
    huella = hash_total.hexdigest()[:8]
    actualizados = actualizar_cache_sw(huella)
    if actualizados:
        print("Caché PWA actualizada (%s): mylivegame-app-%s" % (", ".join(actualizados), huella))

    print("\nListo. Recuerda probar las dos versiones.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
