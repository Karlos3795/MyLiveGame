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
          fases: normalizarFases(m.fases),
          dependencias: normalizarDependencias(m.dependencias, m.fases),
        }));
    }
  });
  return base;
}

function normalizarFases(fases) {
  if (!Array.isArray(fases)) return [];
  const ids = new Set();
  return fases.filter((fase) => fase && typeof fase === "object").slice(0, 100).map((fase, indice) => {
    let id = String(fase.id || nuevoId());
    if (ids.has(id)) id = nuevoId();
    ids.add(id);
    return {
      id,
      titulo: String(fase.titulo || `Fase ${indice + 1}`).trim().slice(0, 160),
      descripcion: String(fase.descripcion || "").trim().slice(0, 1000),
      fecha_inicio: String(fase.fecha_inicio || "").slice(0, 10),
      fecha_fin: String(fase.fecha_fin || "").slice(0, 10),
      notificar_inicio: Boolean(fase.notificar_inicio),
      notificar_fin: Boolean(fase.notificar_fin),
      notificado_inicio: String(fase.notificado_inicio || "").slice(0, 10),
      notificado_fin: String(fase.notificado_fin || "").slice(0, 10),
      valor: Number.isFinite(Number(fase.valor)) && Number(fase.valor) >= 0 ? Number(fase.valor) : 1,
      x: Math.max(8, Math.min(930, Number(fase.x) || 24)),
      y: Math.max(8, Math.min(460, Number(fase.y) || 24)),
      completada: Boolean(fase.completada),
      fecha_completada: String(fase.fecha_completada || ""),
    };
  });
}

function normalizarDependencias(dependencias, fases) {
  if (!Array.isArray(dependencias) || !Array.isArray(fases)) return [];
  const ids = new Set(fases.map((fase) => String(fase && fase.id || "")));
  const vistas = new Set();
  return dependencias.filter((arista) => {
    if (!arista || !ids.has(String(arista.desde)) || !ids.has(String(arista.hasta)) || arista.desde === arista.hasta) return false;
    const clave = `${arista.desde}>${arista.hasta}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  }).map((arista) => ({ desde: String(arista.desde), hasta: String(arista.hasta) }));
}

function grafoTieneCiclos(fases, dependencias) {
  const ids = new Set(fases.map((fase) => fase.id));
  const grados = new Map(Array.from(ids, (id) => [id, 0]));
  const salidas = new Map(Array.from(ids, (id) => [id, []]));
  dependencias.forEach((arista) => {
    if (!ids.has(arista.desde) || !ids.has(arista.hasta) || arista.desde === arista.hasta) {
      throw new Error("Hay una flecha inválida entre fases.");
    }
    salidas.get(arista.desde).push(arista.hasta);
    grados.set(arista.hasta, grados.get(arista.hasta) + 1);
  });
  const pendientes = Array.from(grados).filter(([, grado]) => grado === 0).map(([id]) => id);
  let visitadas = 0;
  while (pendientes.length) {
    const actual = pendientes.pop();
    visitadas += 1;
    salidas.get(actual).forEach((destino) => {
      grados.set(destino, grados.get(destino) - 1);
      if (grados.get(destino) === 0) pendientes.push(destino);
    });
  }
  return visitadas !== ids.size;
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
    const fechaInicio = String(datos.fecha_inicio || "").trim().slice(0, 10);
    const fechaFin = String(datos.fecha_fin || "").trim().slice(0, 10);
    const ahora = new Date();
    const hoy = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (fechaInicio && fechaInicio < hoy) {
      throw new Error("La fecha inicio no puede ser anterior a hoy.");
    }
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
    }
    const fases = normalizarFases(datos.fases);
    const dependencias = normalizarDependencias(datos.dependencias, fases);
    if (dependencias.length !== (Array.isArray(datos.dependencias) ? datos.dependencias.length : 0)) {
      throw new Error("Hay una flecha inválida entre fases.");
    }
    if (grafoTieneCiclos(fases, dependencias)) {
      throw new Error("Las dependencias entre fases no pueden formar ciclos.");
    }
    fases.forEach((fase) => {
      if (!fase.titulo) throw new Error("Cada fase necesita un título.");
      if (fase.fecha_inicio && fase.fecha_inicio < hoy) {
        throw new Error(`La fase «${fase.titulo}» tiene una fecha inicio anterior a hoy.`);
      }
      if (fase.fecha_inicio && fase.fecha_fin && fase.fecha_fin < fase.fecha_inicio) {
        throw new Error(`La fase «${fase.titulo}» tiene una fecha fin anterior a su inicio.`);
      }
    });
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = {
      id: nuevoId(),
      titulo: titulo.slice(0, 160),
      descripcion: String(datos.descripcion || "").trim().slice(0, 1000),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      notificar_inicio: Boolean(datos.notificar_inicio),
      notificar_fin: Boolean(datos.notificar_fin),
      notificado_inicio: "",
      notificado_fin: "",
      fases,
      dependencias,
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
    if (misiones[tipo][indice].fases.some((fase) => !fase.completada)) {
      throw new Error("Completa todas las fases antes de cerrar esta misión.");
    }
    const [mision] = misiones[tipo].splice(indice, 1);
    mision.fecha_completada = fechaAhora();
    const completadas = leerJSON(CLAVE_COMPLETADAS, []);
    completadas.push(mision);
    escribirJSON(CLAVE_COMPLETADAS, completadas);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, completadas: completadas.length };
  },

  async completarFase(tipo, id, idFase) {
    if (!TIPOS_APP.includes(tipo)) throw new Error("Tipo de misión no válido.");
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = misiones[tipo].find((item) => item.id === id);
    if (!mision) throw new Error("Misión no encontrada.");
    const fase = mision.fases.find((item) => item.id === idFase);
    if (!fase) throw new Error("Fase no encontrada.");
    const previas = mision.dependencias.filter((arista) => arista.hasta === idFase);
    const bloqueada = previas.some((arista) => !mision.fases.some((previa) => previa.id === arista.desde && previa.completada));
    if (bloqueada) throw new Error("Primero debes completar las fases anteriores.");
    if (!fase.completada) {
      fase.completada = true;
      fase.fecha_completada = fechaAhora();
      escribirJSON(CLAVE_MISIONES, misiones);
    }
    return { ok: true, fase };
  },

  async cambiarTipo(tipoOrigen, id, tipoDestino) {
    if (!TIPOS_APP.includes(tipoOrigen) || !TIPOS_APP.includes(tipoDestino)) {
      throw new Error("Categoría de misión no válida.");
    }
    if (tipoOrigen === tipoDestino) return { ok: true };
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const indice = misiones[tipoOrigen].findIndex((mision) => mision.id === id);
    if (indice === -1) throw new Error("Misión no encontrada.");
    const [mision] = misiones[tipoOrigen].splice(indice, 1);
    misiones[tipoDestino].push(mision);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, mision };
  },

  async marcarNotificada(tipo, id, extremo, fecha, idFase = "") {
    if (!TIPOS_APP.includes(tipo) || !["inicio", "fin"].includes(extremo)) {
      throw new Error("Datos de notificación no válidos.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = misiones[tipo].find((m) => m.id === id);
    if (!mision) throw new Error("Misión no encontrada.");
    const objetivo = idFase ? mision.fases.find((fase) => fase.id === idFase) : mision;
    if (!objetivo) throw new Error("Fase no encontrada.");
    objetivo[`notificado_${extremo}`] = String(fecha || "").slice(0, 10);
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
