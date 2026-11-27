#!/usr/bin/env python3
"""Genera los iconos MLG de MyLiveGame (beta) con Pillow."""

import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def mezclar(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def crear_icono(tam, maskable=False):
    escala = 3
    lado = tam * escala
    img = Image.new("RGBA", (lado, lado))
    pixel = img.load()
    paradas = [
        (0.0, (255, 91, 157)),
        (0.28, (255, 123, 139)),
        (0.52, (255, 171, 106)),
        (0.76, (170, 105, 174)),
        (1.0, (83, 157, 184)),
    ]
    for y in range(lado):
        # Degradado diagonal continuo, solo color de fondo; sin sol, siluetas,
        # rayas ni ilustraciones detrás de las letras.
        ty = y / max(1, lado - 1)
        for x in range(lado):
            t = min(1.0, 0.72 * ty + 0.28 * x / max(1, lado - 1))
            for (t0, c0), (t1, c1) in zip(paradas, paradas[1:]):
                if t0 <= t <= t1:
                    color = mezclar(c0, c1, (t - t0) / (t1 - t0))
                    pixel[x, y] = (*color, 255)
                    break

    dibujo = ImageDraw.Draw(img)

    fuente = ImageFont.truetype(FUENTE, int(lado * 0.42))
    texto = "MLG"
    caja = dibujo.textbbox((0, 0), texto, font=fuente, stroke_width=0)
    while caja[2] - caja[0] > lado * 0.88:
        fuente = ImageFont.truetype(FUENTE, int(fuente.size * 0.96))
        caja = dibujo.textbbox((0, 0), texto, font=fuente)
    x = (lado - (caja[2] - caja[0])) // 2 - caja[0]
    y = (lado - (caja[3] - caja[1])) // 2 - caja[1]
    # Único elemento gráfico del icono: el monograma MLG, negro y grueso.
    dibujo.text((x, y), texto, font=fuente, fill=(10, 10, 14, 255), stroke_width=max(1, escala), stroke_fill=(10, 10, 14, 255))

    img = img.resize((tam, tam), Image.Resampling.LANCZOS)
    if not maskable:
        mascara = Image.new("L", (tam, tam), 0)
        ImageDraw.Draw(mascara).rounded_rectangle((0, 0, tam - 1, tam - 1), radius=int(tam * 0.22), fill=255)
        img.putalpha(mascara)
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
