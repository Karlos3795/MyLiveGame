#!/usr/bin/env python3
"""Copia el código compartido (interfaz y estilos) a las dos versiones.

Flujo de desarrollo:
  1. Edita `comun/style.css` o `comun/nucleo.js`.
  2. Ejecuta `python3 sincronizar.py`.
  3. Prueba `web/` y `app/`.

Así la versión web y la app mantienen la misma interfaz. Cada versión solo
se diferencia en su `index.html` y en su `almacen.js` (servidor o local).
"""

import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
COMPARTIDOS = ("style.css", "nucleo.js")
DESTINOS = (os.path.join(BASE, "web", "static"), os.path.join(BASE, "app"))


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
    ruta = os.path.join(BASE, "app", "sw.js")
    if not os.path.exists(ruta):
        return False
    with open(ruta, "r", encoding="utf-8") as f:
        codigo = f.read()
    nuevo, cambios = re.subn(
        r'const CACHE = "misiones-app-[^"]*";',
        'const CACHE = "misiones-app-%s";' % huella,
        codigo,
    )
    if cambios:
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(nuevo)
    return bool(cambios)


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

    # La caché del service worker cambia cuando cambia la interfaz.
    for extra in ("app/index.html", "app/almacen.js", "app/manifest.webmanifest"):
        ruta = os.path.join(BASE, extra)
        if os.path.exists(ruta):
            hash_total.update(leer(ruta))
    huella = hash_total.hexdigest()[:8]
    if actualizar_cache_sw(huella):
        print("Caché de la app actualizada: misiones-app-%s" % huella)

    print("\nListo. Recuerda probar las dos versiones.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
