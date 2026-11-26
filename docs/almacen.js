/* Adaptador de datos para la versión APP (instalable).
 * Todo se guarda en localStorage del dispositivo: no hay servidor ni red.
 */

"use strict";

const CLAVE_MISIONES = "misiones.app.v1";
const CLAVE_COMPLETADAS = "misiones.app.v1.completadas";
const TIPOS_APP = ["principales", "secundarias", "campo", "diarias"];

function misionesVacias() {
  return { principales: [], secundarias: [], campo: [], diarias: [] };
}

function leerJSON(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return porDefecto;
    const valor = JSON.parse(crudo);
    return valor == null ? porDefecto : valor;
  } catch (_) {
    return porDefecto;
  }
}

function escribirJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (_) {
    throw new Error("No se pudo guardar en el almacenamiento del dispositivo.");
  }
}

function normalizarMisiones(datos) {
  const base = misionesVacias();
  if (!datos || typeof datos !== "object") return base;
  TIPOS_APP.forEach((tipo) => {
    if (Array.isArray(datos[tipo])) {
      base[tipo] = datos[tipo]
        .filter((m) => m && typeof m === "object" && m.titulo)
        .map((m) => ({
          id: String(m.id || nuevoId()),
          titulo: String(m.titulo).slice(0, 160),
          descripcion: String(m.descripcion || "").slice(0, 1000),
          fecha_inicio: String(m.fecha_inicio || "").slice(0, 10),
          fecha_fin: String(m.fecha_fin || "").slice(0, 10),
          notificar_inicio: Boolean(m.notificar_inicio),
          notificar_fin: Boolean(m.notificar_fin),
          notificado_inicio: String(m.notificado_inicio || "").slice(0, 10),
          notificado_fin: String(m.notificado_fin || "").slice(0, 10),
          creada: String(m.creada || fechaAhora()),
        }));
    }
  });
  return base;
}

function nuevoId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  }
  const aleatorio = new Uint8Array(5);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(aleatorio);
  } else {
    for (let i = 0; i < aleatorio.length; i += 1) {
      aleatorio[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(aleatorio, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fechaAhora() {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - desfase).toISOString().slice(0, 19);
}

function descargar(nombre, contenido, tipoMime) {
  const blob = new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escaparCSV(valor) {
  const texto = String(valor == null ? "" : valor);
  if (/[",\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function generarCSV(completadas) {
  const cabecera = [
    "titulo",
    "descripcion",
    "fecha_inicio",
    "fecha_fin",
    "completada",
    "fecha_completada",
  ];
  const filas = [cabecera.map(escaparCSV).join(",")];
  completadas.forEach((m) => {
    filas.push(
      [
        m.titulo || "",
        m.descripcion || "",
        m.fecha_inicio || "",
        m.fecha_fin || "",
        "true",
        m.fecha_completada || "",
      ]
        .map(escaparCSV)
        .join(",")
    );
  });
  return filas.join("\r\n") + "\r\n";
}

window.Almacen = {
  modo: "local",

  async cargar() {
    return {
      misiones: normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias())),
      completadas: leerJSON(CLAVE_COMPLETADAS, []).length,
    };
  },

  async crear(datos) {
    const tipo = String(datos.tipo || "");
    const titulo = String(datos.titulo || "").trim();
    if (!TIPOS_APP.includes(tipo)) {
      throw new Error("Tipo de misión no válido.");
    }
    if (!titulo) {
      throw new Error("El título es obligatorio.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = {
      id: nuevoId(),
      titulo: titulo.slice(0, 160),
      descripcion: String(datos.descripcion || "").trim().slice(0, 1000),
      fecha_inicio: String(datos.fecha_inicio || "").trim().slice(0, 10),
      fecha_fin: String(datos.fecha_fin || "").trim().slice(0, 10),
      notificar_inicio: Boolean(datos.notificar_inicio),
      notificar_fin: Boolean(datos.notificar_fin),
      notificado_inicio: "",
      notificado_fin: "",
      creada: fechaAhora(),
    };
    misiones[tipo].push(mision);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, mision };
  },

  async completar(tipo, id) {
    if (!TIPOS_APP.includes(tipo)) {
      throw new Error("Tipo de misión no válido.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const indice = misiones[tipo].findIndex((m) => m.id === id);
    if (indice === -1) {
      throw new Error("Misión no encontrada.");
    }
    const [mision] = misiones[tipo].splice(indice, 1);
    mision.fecha_completada = fechaAhora();
    const completadas = leerJSON(CLAVE_COMPLETADAS, []);
    completadas.push(mision);
    escribirJSON(CLAVE_COMPLETADAS, completadas);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, completadas: completadas.length };
  },

  async marcarNotificada(tipo, id, extremo, fecha) {
    if (!TIPOS_APP.includes(tipo) || !["inicio", "fin"].includes(extremo)) {
      throw new Error("Datos de notificación no válidos.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = misiones[tipo].find((m) => m.id === id);
    if (!mision) throw new Error("Misión no encontrada.");
    mision[`notificado_${extremo}`] = String(fecha || "").slice(0, 10);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true };
  },

  async descargarCSV() {
    const completadas = leerJSON(CLAVE_COMPLETADAS, []);
    if (completadas.length === 0) {
      throw new Error("Todavía no hay misiones completadas.");
    }
    descargar(
      "misiones_completadas.csv",
      "\ufeff" + generarCSV(completadas),
      "text/csv;charset=utf-8"
    );
  },

  async exportarCopia() {
    const datos = {
      formato: "misiones-copia",
      version: 1,
      exportado: fechaAhora(),
      misiones: normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias())),
      completadas: leerJSON(CLAVE_COMPLETADAS, []),
    };
    descargar(
      `misiones-copia-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(datos, null, 2),
      "application/json;charset=utf-8"
    );
  },

  async importarCopia(datos) {
    if (!datos || typeof datos !== "object" || !datos.misiones) {
      throw new Error("El archivo de copia no tiene el formato esperado.");
    }
    const misiones = normalizarMisiones(datos.misiones);
    const completadas = Array.isArray(datos.completadas) ? datos.completadas : [];
    escribirJSON(CLAVE_MISIONES, misiones);
    escribirJSON(CLAVE_COMPLETADAS, completadas);
  },
};
