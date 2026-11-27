#!/usr/bin/env python3
"""Servidor minimo para el prototipo "Misiones".

Sin dependencias externas: solo la libreria estandar de Python.
Sirve la interfaz web y guarda las misiones completadas en un CSV.
"""

import csv
import copy
import json
import os
import re
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
HISTORIAL_PATH = os.path.join(DATA_DIR, "historial.json")

TIPOS = ("principales", "secundarias", "campo", "diarias")
MAX_FASES = 100

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
    return len(cargar_historial())


def cargar_historial():
    if not os.path.exists(HISTORIAL_PATH):
        historial = []
        if os.path.exists(CSV_PATH):
            with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
                for fila in csv.DictReader(f):
                    historial.append({
                        "titulo": fila.get("titulo", ""),
                        "descripcion": fila.get("descripcion", ""),
                        "fecha_inicio": fila.get("fecha_inicio", ""),
                        "fecha_fin": fila.get("fecha_fin", ""),
                        "fecha_completada": fila.get("fecha_completada", ""),
                        "tipo": "",  # las filas antiguas no tenían este dato
                    })
        guardar_historial(historial)
        return historial
    with _lock:
        with open(HISTORIAL_PATH, "r", encoding="utf-8") as f:
            datos = json.load(f)
    return datos if isinstance(datos, list) else []


def guardar_historial(historial):
    with _lock:
        tmp = HISTORIAL_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(historial, f, ensure_ascii=False, indent=2)
        os.replace(tmp, HISTORIAL_PATH)


def registrar_completada(mision, tipo):
    historial = cargar_historial()
    registro = copy.deepcopy(mision)
    registro["tipo"] = tipo
    registro["fecha_completada"] = datetime.now().isoformat(timespec="seconds")
    añadir_al_csv(registro)
    historial.append(registro)
    guardar_historial(historial)
    return registro, len(historial)


def validar_fecha(valor, etiqueta, hoy):
    if not valor:
        return ""
    try:
        fecha = datetime.strptime(valor, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError(f"La fecha {etiqueta} no es válida") from error
    if fecha.strftime("%Y-%m-%d") != valor:
        raise ValueError(f"La fecha {etiqueta} no es válida")
    if etiqueta.endswith("inicio") and valor < hoy:
        raise ValueError(f"La fecha {etiqueta} no puede ser anterior a hoy")
    return valor


def validar_hora(valor, etiqueta, por_defecto):
    hora = str(valor or por_defecto).strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", hora):
        raise ValueError(f"La hora {etiqueta} no es válida")
    return hora


def validar_campos_mision(datos, hoy, fecha_inicio_anterior=""):
    titulo = str(datos.get("titulo", "")).strip()[:160]
    if not titulo:
        raise ValueError("El título es obligatorio")
    inicio = str(datos.get("fecha_inicio", "")).strip()[:10]
    limite_inicio = fecha_inicio_anterior if inicio and inicio == fecha_inicio_anterior else hoy
    inicio = validar_fecha(inicio, "de inicio", limite_inicio)
    fin = validar_fecha(str(datos.get("fecha_fin", "")).strip()[:10], "de fin", hoy)
    if inicio and fin and fin < inicio:
        raise ValueError("La fecha fin no puede ser anterior a la fecha inicio")
    hora_inicio = validar_hora(datos.get("hora_aviso_inicio"), "del aviso de inicio", "00:00")
    hora_fin = validar_hora(datos.get("hora_aviso_fin"), "del aviso de fin", "23:59")
    if inicio and fin and inicio == fin and hora_fin <= hora_inicio:
        raise ValueError("Si inicio y fin coinciden, la hora fin debe ser posterior a la hora inicio")
    dias = datos.get("dias_regular", [])
    if not isinstance(dias, list):
        raise ValueError("Los días de recurrencia no son válidos")
    dias = sorted({int(dia) for dia in dias if str(dia).isdigit() and 0 <= int(dia) <= 6})
    regular = bool(datos.get("regular", False))
    if regular and not dias:
        raise ValueError("Selecciona al menos un día para la misión regular")
    hora_regular = str(datos.get("hora_regular", "")).strip()
    if hora_regular:
        hora_regular = validar_hora(hora_regular, "de reactivación", "00:00")
    return {
        "titulo": titulo,
        "descripcion": str(datos.get("descripcion", "")).strip()[:1000],
        "fecha_inicio": inicio,
        "fecha_fin": fin,
        "notificar_inicio": bool(datos.get("notificar_inicio", False)),
        "notificar_fin": bool(datos.get("notificar_fin", False)),
        "hora_aviso_inicio": hora_inicio,
        "hora_aviso_fin": hora_fin,
        "regular": regular,
        "dias_regular": dias,
        "hora_regular": hora_regular,
        "notificar_regular": bool(datos.get("notificar_regular", False)) and bool(hora_regular),
    }


def normalizar_fases(fases, hoy, fases_anteriores=None):
    if fases is None:
        return []
    if not isinstance(fases, list) or len(fases) > MAX_FASES:
        raise ValueError(f"La misión admite hasta {MAX_FASES} fases")
    resultado = []
    ids = set()
    fechas_anteriores = {fase.get("id"): fase.get("fecha_inicio", "") for fase in (fases_anteriores or [])}
    for indice, fase in enumerate(fases):
        if not isinstance(fase, dict):
            raise ValueError("Los datos de una fase no son válidos")
        fid = str(fase.get("id", "")).strip()[:40] or uuid.uuid4().hex[:12]
        if fid in ids:
            raise ValueError("Hay identificadores de fase duplicados")
        ids.add(fid)
        titulo = str(fase.get("titulo", "")).strip()[:160]
        if not titulo:
            raise ValueError(f"La fase {indice + 1} necesita un título")
        inicio = str(fase.get("fecha_inicio", "")).strip()[:10]
        limite_inicio = fechas_anteriores.get(fid, hoy) if inicio and inicio == fechas_anteriores.get(fid) else hoy
        inicio = validar_fecha(inicio, "de inicio", limite_inicio)
        fin = validar_fecha(str(fase.get("fecha_fin", "")).strip()[:10], "de fin", hoy)
        if inicio and fin and fin < inicio:
            raise ValueError(f"La fecha fin de «{titulo}» no puede ser anterior a su inicio")
        hora_inicio = validar_hora(fase.get("hora_aviso_inicio"), "del aviso de inicio", "00:00")
        hora_fin = validar_hora(fase.get("hora_aviso_fin"), "del aviso de fin", "23:59")
        if inicio and fin and inicio == fin and hora_fin <= hora_inicio:
            raise ValueError(f"La hora fin de «{titulo}» debe ser posterior a su hora de inicio")
        try:
            valor = float(fase.get("valor", 1))
        except (TypeError, ValueError) as error:
            raise ValueError(f"El valor de «{titulo}» debe ser numérico") from error
        if valor < 0 or valor != valor or valor == float("inf"):
            raise ValueError(f"El valor de «{titulo}» debe ser mayor o igual que cero")
        resultado.append({
            "id": fid,
            "titulo": titulo,
            "descripcion": str(fase.get("descripcion", "")).strip()[:1000],
            "fecha_inicio": inicio,
            "fecha_fin": fin,
            "notificar_inicio": bool(fase.get("notificar_inicio", False)),
            "notificar_fin": bool(fase.get("notificar_fin", False)),
            "hora_aviso_inicio": hora_inicio,
            "hora_aviso_fin": hora_fin,
            "notificado_inicio": "",
            "notificado_fin": "",
            "valor": valor,
            "x": max(8, min(930, int(fase.get("x", 24)))),
            "y": max(8, min(460, int(fase.get("y", 24)))),
            "completada": False,
            "fecha_completada": "",
        })
    return resultado


def normalizar_dependencias(dependencias, fases):
    if dependencias is None:
        return []
    if not isinstance(dependencias, list) or len(dependencias) > MAX_FASES * 4:
        raise ValueError("La lista de flechas no es válida")
    ids = {fase["id"] for fase in fases}
    resultado = []
    unicas = set()
    salidas = {fid: [] for fid in ids}
    grados = {fid: 0 for fid in ids}
    for arista in dependencias:
        if not isinstance(arista, dict):
            raise ValueError("Hay una flecha inválida entre fases")
        desde = str(arista.get("desde", ""))
        hasta = str(arista.get("hasta", ""))
        clave = (desde, hasta)
        if desde not in ids or hasta not in ids or desde == hasta or clave in unicas:
            raise ValueError("Hay una flecha inválida o repetida entre fases")
        unicas.add(clave)
        salidas[desde].append(hasta)
        grados[hasta] += 1
        resultado.append({"desde": desde, "hasta": hasta})
    pendientes = [fid for fid, grado in grados.items() if grado == 0]
    visitadas = 0
    while pendientes:
        actual = pendientes.pop()
        visitadas += 1
        for siguiente in salidas[actual]:
            grados[siguiente] -= 1
            if grados[siguiente] == 0:
                pendientes.append(siguiente)
    if visitadas != len(ids):
        raise ValueError("Las dependencias entre fases no pueden formar ciclos")
    return resultado


class Handler(BaseHTTPRequestHandler):
    server_version = "MyLiveGame/2.0-beta"

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
            historial = cargar_historial()
            self._json(
                {
                    "ok": True,
                    "misiones": cargar_misiones(),
                    "completadas": len(historial),
                    "historial": historial,
                }
            )
            return
        if ruta == "/api/historial":
            self._json({"ok": True, "historial": cargar_historial()})
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
            if tipo not in TIPOS:
                self._error("Tipo de mision no valido")
                return
            fecha_hoy_local = str(datos.get("fecha_hoy_local", "")).strip()[:10]
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
            try:
                campos = validar_campos_mision(datos, fecha_hoy_local)
                fases = normalizar_fases(datos.get("fases", []), fecha_hoy_local)
                dependencias = normalizar_dependencias(datos.get("dependencias", []), fases)
            except (TypeError, ValueError, OverflowError) as error:
                self._error(str(error))
                return
            mision = {
                "id": uuid.uuid4().hex[:10],
                **campos,
                "notificado_inicio": "",
                "notificado_fin": "",
                "notificado_regular_el": "",
                "completada_el": "",
                "fases": fases,
                "dependencias": dependencias,
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
            fid = str(datos.get("id_fase", "")).strip()
            if tipo not in TIPOS or extremo not in ("inicio", "fin", "regular") or not fecha:
                self._error("Datos de notificación no válidos")
                return
            data = cargar_misiones()
            encontrada = next((m for m in data[tipo] if m.get("id") == mid), None)
            if encontrada is None:
                self._error("Misión no encontrada", 404)
                return
            if extremo == "regular" and fid:
                self._error("El aviso de recurrencia pertenece a la misión")
                return
            if fid:
                fase = next((f for f in encontrada.get("fases", []) if f.get("id") == fid), None)
                if fase is None:
                    self._error("Fase no encontrada", 404)
                    return
                fase["notificado_" + extremo] = fecha
            elif extremo == "regular":
                encontrada["notificado_regular_el"] = fecha
            else:
                encontrada["notificado_" + extremo] = fecha
            guardar_misiones(data)
            self._json({"ok": True})
            return

        if ruta == "/api/misiones/editar":
            tipo_origen = str(datos.get("tipo_origen", "")).strip()
            if tipo_origen not in TIPOS:
                self._error("Categoría de misión no válida")
                return
            mid = str(datos.get("id", "")).strip()
            data = cargar_misiones()
            mision = next((m for m in data[tipo_origen] if m.get("id") == mid), None)
            if mision is None:
                self._error("Misión no encontrada", 404)
                return
            fecha_hoy_local = str(datos.get("fecha_hoy_local", "")).strip()[:10]
            if not fecha_hoy_local:
                fecha_hoy_local = datetime.now().date().isoformat()
            try:
                campos = validar_campos_mision(datos, fecha_hoy_local, mision.get("fecha_inicio", ""))
                fases = normalizar_fases(datos.get("fases", mision.get("fases", [])), fecha_hoy_local, mision.get("fases", []))
                dependencias = normalizar_dependencias(datos.get("dependencias", mision.get("dependencias", [])), fases)
            except (TypeError, ValueError, OverflowError) as error:
                self._error(str(error))
                return
            fases_antiguas = {fase.get("id"): fase for fase in mision.get("fases", [])}
            for fase in fases:
                antigua = fases_antiguas.get(fase["id"])
                if antigua:
                    fase["completada"] = bool(antigua.get("completada"))
                    fase["fecha_completada"] = antigua.get("fecha_completada", "")
                    for extremo in ("inicio", "fin"):
                        fecha_campo = "fecha_" + extremo
                        hora_campo = "hora_aviso_" + extremo
                        if antigua.get(fecha_campo) == fase.get(fecha_campo) and antigua.get(hora_campo, "00:00" if extremo == "inicio" else "23:59") == fase.get(hora_campo):
                            fase["notificado_" + extremo] = antigua.get("notificado_" + extremo, "")
            avisos_cambiados = any(
                mision.get(campo, defecto) != campos.get(campo)
                for campo, defecto in (
                    ("fecha_inicio", ""), ("fecha_fin", ""),
                    ("hora_aviso_inicio", "00:00"), ("hora_aviso_fin", "23:59"),
                )
            )
            tipo_destino = str(datos.get("tipo", tipo_origen)).strip()
            if tipo_destino not in TIPOS:
                self._error("Categoría de misión no válida")
                return
            horario_regular_cambiado = mision.get("hora_regular", "") != campos["hora_regular"]
            mision.update(campos)
            mision["fases"] = fases
            mision["dependencias"] = dependencias
            if avisos_cambiados:
                mision["notificado_inicio"] = ""
                mision["notificado_fin"] = ""
            if horario_regular_cambiado:
                mision["notificado_regular_el"] = ""
            if tipo_destino != "diarias" and not mision.get("regular"):
                mision["completada_el"] = ""
            if tipo_destino != tipo_origen:
                data[tipo_origen].remove(mision)
                data[tipo_destino].append(mision)
            guardar_misiones(data)
            self._json({"ok": True, "tipo": tipo_destino, "mision": mision})
            return

        if ruta == "/api/misiones/cancelar":
            tipo = str(datos.get("tipo", "")).strip()
            mid = str(datos.get("id", "")).strip()
            if tipo not in TIPOS:
                self._error("Categoría de misión no válida")
                return
            data = cargar_misiones()
            mision = next((m for m in data[tipo] if m.get("id") == mid), None)
            if mision is None:
                self._error("Misión no encontrada", 404)
                return
            data[tipo].remove(mision)
            guardar_misiones(data)
            self._json({"ok": True})
            return

        if ruta == "/api/misiones/fase/completar":
            tipo = str(datos.get("tipo", "")).strip()
            mid = str(datos.get("id", "")).strip()
            fid = str(datos.get("id_fase", "")).strip()
            if tipo not in TIPOS:
                self._error("Tipo de misión no válido")
                return
            data = cargar_misiones()
            mision = next((m for m in data[tipo] if m.get("id") == mid), None)
            if mision is None:
                self._error("Misión no encontrada", 404)
                return
            fase = next((f for f in mision.get("fases", []) if f.get("id") == fid), None)
            if fase is None:
                self._error("Fase no encontrada", 404)
                return
            previas = [a for a in mision.get("dependencias", []) if a.get("hasta") == fid]
            anteriores_pendientes = [
                a for a in previas
                if not any(f.get("id") == a.get("desde") and f.get("completada") for f in mision.get("fases", []))
            ]
            if anteriores_pendientes:
                self._error("Primero debes completar todas las fases anteriores", 409)
                return
            if not fase.get("completada"):
                fase["completada"] = True
                fase["fecha_completada"] = datetime.now().isoformat(timespec="seconds")
                guardar_misiones(data)
            self._json({"ok": True, "fase": fase})
            return

        if ruta == "/api/misiones/cambiar-tipo":
            origen = str(datos.get("tipo_origen", "")).strip()
            destino = str(datos.get("tipo_destino", "")).strip()
            mid = str(datos.get("id", "")).strip()
            if origen not in TIPOS or destino not in TIPOS:
                self._error("Categoría de misión no válida")
                return
            if origen == destino:
                self._json({"ok": True})
                return
            data = cargar_misiones()
            mision = next((m for m in data[origen] if m.get("id") == mid), None)
            if mision is None:
                self._error("Misión no encontrada", 404)
                return
            data[origen].remove(mision)
            data[destino].append(mision)
            guardar_misiones(data)
            self._json({"ok": True, "mision": mision})
            return

        if ruta == "/api/misiones/completar":
            tipo = str(datos.get("tipo", "")).strip()
            mid = str(datos.get("id", "")).strip()
            fecha_hoy_local = str(datos.get("fecha_hoy_local", "")).strip()[:10]
            if tipo not in TIPOS:
                self._error("Tipo de mision no valido")
                return
            if fecha_hoy_local:
                try:
                    dia_local = datetime.strptime(fecha_hoy_local, "%Y-%m-%d").date()
                except ValueError:
                    self._error("La fecha local de hoy no es válida")
                    return
                if dia_local.isoformat() != fecha_hoy_local:
                    self._error("La fecha local de hoy no es válida")
                    return
            else:
                dia_local = datetime.now().date()
                fecha_hoy_local = dia_local.isoformat()
            data = cargar_misiones()
            encontrada = None
            for m in data[tipo]:
                if m.get("id") == mid:
                    encontrada = m
                    break
            if encontrada is None:
                self._error("Mision no encontrada", 404)
                return
            repetible = tipo == "diarias" or bool(encontrada.get("regular"))
            if repetible and encontrada.get("completada_el") == fecha_hoy_local:
                self._error("Esta misión ya se completó durante su ciclo actual", 409)
                return
            dia_semana_js = (dia_local.weekday() + 1) % 7
            if encontrada.get("regular") and dia_semana_js not in encontrada.get("dias_regular", []):
                self._error("Hoy no es uno de los días programados para esta misión", 409)
                return
            if any(not fase.get("completada") for fase in encontrada.get("fases", [])):
                self._error("Completa todas las fases antes de cerrar esta misión", 409)
                return
            registro, cuenta = registrar_completada(encontrada, tipo)
            if repetible:
                encontrada["completada_el"] = fecha_hoy_local
                encontrada["fases"] = [
                    {**fase, "completada": False, "fecha_completada": "", "notificado_inicio": "", "notificado_fin": ""}
                    for fase in encontrada.get("fases", [])
                ]
                encontrada["notificado_regular_el"] = ""
            else:
                data[tipo].remove(encontrada)
            guardar_misiones(data)
            self._json(
                {"ok": True, "completadas": cuenta, "repetible": repetible, "mision": encontrada, "registro": registro}, 200
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
