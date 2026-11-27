#!/usr/bin/env python3
"""Genera los iconos MLG de MyLiveGame (beta) con Pillow."""

import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def mezclar(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def palma(dibujo, x, base, escala, color, brillo):
    ancho = max(2, round(escala * 0.022))
    corona = (x + escala * 0.018, base - escala * 0.39)
    dibujo.line(
        [
            (x, base),
            (x + escala * 0.035, base - escala * 0.15),
            (x + escala * 0.012, base - escala * 0.28),
            corona,
        ],
        fill=color,
        width=ancho,
        joint="curve",
    )
    # Hojas arqueadas y nervaduras: silueta tropical, no un logotipo ajeno.
    for angulo in (-165, -145, -125, -105, -85, -65, -45, -25, -5):
        import math

        rad = math.radians(angulo)
        largo = escala * (0.18 if abs(angulo + 85) > 40 else 0.22)
        punta = (corona[0] + math.cos(rad) * largo, corona[1] + math.sin(rad) * largo)
        medio = (corona[0] + (punta[0] - corona[0]) * 0.56, corona[1] + (punta[1] - corona[1]) * 0.48 - escala * 0.025)
        dibujo.line([corona, medio, punta], fill=color, width=ancho)
        for paso in (0.38, 0.58, 0.76):
            px = corona[0] + (punta[0] - corona[0]) * paso
            py = corona[1] + (punta[1] - corona[1]) * paso
            largo_hoja = escala * 0.055 * (1 - paso * 0.35)
            # Hojas a ambos lados de la nervadura principal.
            for lado in (-1, 1):
                dibujo.line(
                    [(px, py), (px - math.sin(rad) * largo_hoja * lado, py + math.cos(rad) * largo_hoja * lado)],
                    fill=brillo if paso > 0.55 else color,
                    width=max(1, ancho // 2),
                )


def skyline(dibujo, lado):
    base = int(lado * 0.83)
    oscuro = (86, 47, 86, 240)
    sombra = (57, 39, 72, 245)
    luz = (255, 166, 112, 235)
    edificios = [
        (0.00, 0.19, 0.14), (0.10, 0.16, 0.23), (0.23, 0.12, 0.18),
        (0.33, 0.13, 0.34), (0.47, 0.15, 0.24), (0.62, 0.12, 0.38),
        (0.75, 0.15, 0.22), (0.88, 0.18, 0.29),
    ]
    for indice, (pos, ancho, altura) in enumerate(edificios):
        x0 = int(lado * pos)
        x1 = int(lado * (pos + ancho))
        y0 = int(lado * (0.83 - altura))
        color = oscuro if indice % 2 else sombra
        dibujo.rectangle((x0, y0, x1, base), fill=color)
        # Detalles art déco y algunas ventanas cálidas.
        dibujo.line((x0 + 2, y0 + 2, x1 - 2, y0 + 2), fill=(255, 147, 122, 220), width=max(1, lado // 180))
        paso_x = max(5, int(lado * 0.035))
        paso_y = max(6, int(lado * 0.045))
        for wx in range(x0 + paso_x // 2, x1 - 2, paso_x):
            for wy in range(y0 + paso_y, base - 3, paso_y):
                if (wx // paso_x + wy // paso_y + indice) % 3:
                    dibujo.rectangle((wx, wy, wx + max(1, lado // 100), wy + max(1, lado // 110)), fill=luz)


def crear_icono(tam, maskable=False):
    escala = 3
    lado = tam * escala
    img = Image.new("RGBA", (lado, lado))
    pixel = img.load()
    paradas = [
        (0.0, (255, 119, 88)),
        (0.42, (255, 181, 91)),
        (0.68, (255, 211, 117)),
        (1.0, (145, 83, 106)),
    ]
    for y in range(lado):
        t = y / max(1, lado - 1)
        for (t0, c0), (t1, c1) in zip(paradas, paradas[1:]):
            if t0 <= t <= t1:
                color = mezclar(c0, c1, (t - t0) / (t1 - t0))
                break
        for x in range(lado):
            pixel[x, y] = (*color, 255)

    dibujo = ImageDraw.Draw(img)

    # Bandas oblicuas de póster retro sobre la misma paleta de atardecer.
    for indice in range(5):
        y = int(lado * (0.12 + indice * 0.105))
        color = (255, 218, 145, 42 - indice * 5)
        dibujo.polygon(
            [(int(lado * 0.02), y), (int(lado * 0.98), y - int(lado * 0.10)),
             (int(lado * 0.98), y + int(lado * 0.012)), (int(lado * 0.02), y + int(lado * 0.11))],
            fill=color,
        )

    skyline(dibujo, lado)
    palma(dibujo, int(lado * 0.10), int(lado * 0.84), lado, (63, 39, 75, 255), (164, 77, 104, 255))
    palma(dibujo, int(lado * 0.86), int(lado * 0.84), lado, (63, 39, 75, 255), (164, 77, 104, 255))

    # Neon magenta glints and a thin horizon line frame the wordmark.
    neon = (220, 92, 130, 230)
    for offset in (0, 1, 2):
        yy = int(lado * (0.78 + offset * 0.028))
        dibujo.line((int(lado * 0.08), yy, int(lado * 0.92), yy), fill=neon, width=max(1, escala - offset // 2))

    fuente = ImageFont.truetype(FUENTE, int(lado * 0.42))
    texto = "MLG"
    caja = dibujo.textbbox((0, 0), texto, font=fuente, stroke_width=0)
    while caja[2] - caja[0] > lado * 0.88:
        fuente = ImageFont.truetype(FUENTE, int(fuente.size * 0.96))
        caja = dibujo.textbbox((0, 0), texto, font=fuente)
    x = (lado - (caja[2] - caja[0])) // 2 - caja[0]
    y = int(lado * 0.47) - (caja[3] - caja[1]) // 2 - caja[1]
    # Sombra corta para dar profundidad de cartel, manteniendo el MLG negro.
    dibujo.text((x + escala * 0.012, y + escala * 0.014), texto, font=fuente, fill=(143, 59, 86, 245), stroke_width=max(1, escala), stroke_fill=(143, 59, 86, 245))
    dibujo.text((x, y), texto, font=fuente, fill=(12, 12, 16, 255), stroke_width=max(1, escala), stroke_fill=(12, 12, 16, 255))

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
