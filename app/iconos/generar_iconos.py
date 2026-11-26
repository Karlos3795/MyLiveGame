#!/usr/bin/env python3
"""Genera los iconos PNG de la app a partir de un dibujo vectorial sencillo.

Solo hace falta ejecutarlo si quieres cambiar el diseño:
    python3 generar_iconos.py

Requiere Pillow (solo para desarrollo; la app no lo necesita).
"""

import os

from PIL import Image, ImageDraw, ImageFilter

BASE = os.path.dirname(os.path.abspath(__file__))
FONDO = (14, 20, 32, 255)
FONDO_INTERIOR = (10, 15, 24, 255)
REJILLA = (40, 56, 80, 70)
ORO = (242, 193, 78, 255)


def _rombo(dibujo, centro, radio, relleno):
    x, y = centro
    dibujo.polygon(
        [(x, y - radio), (x + radio, y), (x, y + radio), (x - radio, y)],
        fill=relleno,
    )


def crear_icono(tam, maskable=False):
    img = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    dibujo = ImageDraw.Draw(img)

    if maskable:
        dibujo.rectangle([0, 0, tam, tam], fill=FONDO)
    else:
        dibujo.rounded_rectangle(
            [0, 0, tam - 1, tam - 1], radius=int(tam * 0.22), fill=FONDO
        )

    # Rejilla de fondo, recortada a la forma del icono.
    rejilla = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rejilla)
    paso = max(6, tam // 12)
    grosor = max(1, tam // 256)
    for pos in range(0, tam + paso, paso):
        rd.line([(pos, 0), (pos, tam)], fill=REJILLA, width=grosor)
        rd.line([(0, pos), (tam, pos)], fill=REJILLA, width=grosor)

    if maskable:
        img.alpha_composite(rejilla)
    else:
        mascara = Image.new("L", (tam, tam), 0)
        ImageDraw.Draw(mascara).rounded_rectangle(
            [0, 0, tam - 1, tam - 1], radius=int(tam * 0.22), fill=255
        )
        img.alpha_composite(Image.composite(rejilla, Image.new("RGBA", (tam, tam)), mascara))

    centro = (tam / 2, tam / 2)

    # Halo.
    halo = Image.new("RGBA", (tam, tam), (0, 0, 0, 0))
    _rombo(ImageDraw.Draw(halo), centro, tam * 0.31, (242, 193, 78, 190))
    halo = halo.filter(ImageFilter.GaussianBlur(tam * 0.055))
    img.alpha_composite(halo)

    # Rombo exterior, interior y núcleo.
    dibujo = ImageDraw.Draw(img)
    _rombo(dibujo, centro, tam * 0.27, ORO)
    _rombo(dibujo, centro, tam * 0.185, FONDO_INTERIOR)
    _rombo(dibujo, centro, tam * 0.085, ORO)

    # Marcas en las esquinas.
    marca = tam * 0.055
    margen = tam * 0.17
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = tam / 2 + sx * (tam / 2 - margen)
            y = tam / 2 + sy * (tam / 2 - margen)
            dibujo.line([(x - marca / 2, y), (x + marca / 2, y)], fill=ORO, width=grosor * 2)
            dibujo.line([(x, y - marca / 2), (x, y + marca / 2)], fill=ORO, width=grosor * 2)

    return img


def main():
    salidas = [
        ("icono-192.png", 192, False),
        ("icono-512.png", 512, False),
        ("icono-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, True),
        ("favicon-64.png", 64, False),
    ]
    for nombre, tam, maskable in salidas:
        ruta = os.path.join(BASE, nombre)
        crear_icono(tam, maskable).save(ruta, "PNG", optimize=True)
        print("Generado", ruta)


if __name__ == "__main__":
    main()
