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
          hora_aviso_inicio: horaNormalizada(m.hora_aviso_inicio, "00:00"),
          hora_aviso_fin: horaNormalizada(m.hora_aviso_fin, "23:59"),
          notificado_inicio: String(m.notificado_inicio || "").slice(0, 10),
          notificado_fin: String(m.notificado_fin || "").slice(0, 10),
          notificado_regular_el: String(m.notificado_regular_el || "").slice(0, 10),
          regular: Boolean(m.regular),
          dias_regular: normalizarDias(m.dias_regular),
          hora_regular: horaNormalizada(m.hora_regular, ""),
          notificar_regular: Boolean(m.notificar_regular),
          completada_el: String(m.completada_el || "").slice(0, 10),
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
      hora_aviso_inicio: horaNormalizada(fase.hora_aviso_inicio, "00:00"),
      hora_aviso_fin: horaNormalizada(fase.hora_aviso_fin, "23:59"),
      valor: Number.isFinite(Number(fase.valor)) && Number(fase.valor) >= 0 ? Number(fase.valor) : 1,
      x: Math.max(8, Math.min(930, Number(fase.x) || 24)),
      y: Math.max(8, Math.min(460, Number(fase.y) || 24)),
      completada: Boolean(fase.completada),
      fecha_completada: String(fase.fecha_completada || ""),
    };
  });
}

function horaNormalizada(valor, porDefecto) {
  const hora = String(valor || "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora) ? hora : porDefecto;
}

function normalizarDias(dias) {
  if (!Array.isArray(dias)) return [];
  return [...new Set(dias.map(Number).filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6))];
}

function hoyLocal() {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function validarFechasYRegular(datos, inicioPasadoPermitido = "") {
  const inicio = String(datos.fecha_inicio || "").trim().slice(0, 10);
  const fin = String(datos.fecha_fin || "").trim().slice(0, 10);
  const horaInicio = horaNormalizada(datos.hora_aviso_inicio, "00:00");
  const horaFin = horaNormalizada(datos.hora_aviso_fin, "23:59");
  if (inicio && inicio < hoyLocal() && inicio !== inicioPasadoPermitido) throw new Error("La fecha inicio no puede ser anterior a hoy.");
  if (inicio && fin && fin < inicio) throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
  if (inicio && fin && inicio === fin && horaFin <= horaInicio) {
    throw new Error("Si inicio y fin coinciden, la hora fin debe ser posterior a la hora inicio.");
  }
  if (datos.hora_aviso_inicio && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora_aviso_inicio)) throw new Error("La hora del aviso de inicio no es válida.");
  if (datos.hora_aviso_fin && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora_aviso_fin)) throw new Error("La hora del aviso de fin no es válida.");
  const regular = Boolean(datos.regular);
  const dias = normalizarDias(datos.dias_regular);
  if (regular && dias.length === 0) throw new Error("Selecciona al menos un día para la misión regular.");
  if (datos.hora_regular && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora_regular)) throw new Error("La hora de reactivación no es válida.");
  return { inicio, fin, horaInicio, horaFin, regular, dias, horaRegular: horaNormalizada(datos.hora_regular, "") };
}

function faseReiniciada(fase) {
  return {
    ...fase,
    completada: false,
    fecha_completada: "",
    notificado_inicio: "",
    notificado_fin: "",
  };
}

function prepararFases(fasesCrudas, dependenciasCrudas, hoy = hoyLocal(), fasesAnteriores = []) {
  if (fasesCrudas != null && !Array.isArray(fasesCrudas)) throw new Error("Los datos de las fases no son válidos.");
  const fases = normalizarFases(fasesCrudas);
  const fechasInicioAnteriores = new Map((fasesAnteriores || []).map((fase) => [fase.id, fase.fecha_inicio]));
  const dependencias = normalizarDependencias(dependenciasCrudas, fases);
  if (dependencias.length !== (Array.isArray(dependenciasCrudas) ? dependenciasCrudas.length : 0)) {
    throw new Error("Hay una flecha inválida entre fases.");
  }
  if (grafoTieneCiclos(fases, dependencias)) throw new Error("Las dependencias entre fases no pueden formar ciclos.");
  fases.forEach((fase) => {
    if (!fase.titulo) throw new Error("Cada fase necesita un título.");
    if (fase.fecha_inicio && fase.fecha_inicio < hoy && fase.fecha_inicio !== fechasInicioAnteriores.get(fase.id)) {
      throw new Error(`La fase «${fase.titulo}» tiene una fecha inicio anterior a hoy.`);
    }
    if (fase.fecha_inicio && fase.fecha_fin && fase.fecha_fin < fase.fecha_inicio) throw new Error(`La fecha fin de «${fase.titulo}» es anterior a su inicio.`);
    if (fase.fecha_inicio && fase.fecha_fin && fase.fecha_inicio === fase.fecha_fin && fase.hora_aviso_fin <= fase.hora_aviso_inicio) {
      throw new Error(`La hora fin de «${fase.titulo}» debe ser posterior a su hora de inicio.`);
    }
  });
  return { fases, dependencias };
}

function leerHistorial() {
  const registros = leerJSON(CLAVE_COMPLETADAS, []);
  if (!Array.isArray(registros)) return [];
  return registros.map((registro) => ({
    ...registro,
    tipo: TIPOS_APP.includes(registro.tipo) ? registro.tipo : "",
    fecha_completada: String(registro.fecha_completada || ""),
  }));
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
    const historial = leerHistorial();
    return {
      misiones: normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias())),
      completadas: historial.length,
      historial,
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
    const reglas = validarFechasYRegular(datos);
    const hoy = hoyLocal();
    const { fases, dependencias } = prepararFases(datos.fases, datos.dependencias, hoy);
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = {
      id: nuevoId(),
      titulo: titulo.slice(0, 160),
      descripcion: String(datos.descripcion || "").trim().slice(0, 1000),
      fecha_inicio: reglas.inicio,
      fecha_fin: reglas.fin,
      notificar_inicio: Boolean(datos.notificar_inicio),
      notificar_fin: Boolean(datos.notificar_fin),
      hora_aviso_inicio: reglas.horaInicio,
      hora_aviso_fin: reglas.horaFin,
      notificado_inicio: "",
      notificado_fin: "",
      notificado_regular_el: "",
      regular: reglas.regular,
      dias_regular: reglas.dias,
      hora_regular: reglas.horaRegular,
      notificar_regular: Boolean(datos.notificar_regular && reglas.horaRegular),
      completada_el: "",
      fases,
      dependencias,
      creada: fechaAhora(),
    };
    misiones[tipo].push(mision);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, mision };
  },

  async completar(tipo, id, fechaHoyLocal = hoyLocal()) {
    if (!TIPOS_APP.includes(tipo)) {
      throw new Error("Tipo de misión no válido.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const indice = misiones[tipo].findIndex((m) => m.id === id);
    if (indice === -1) {
      throw new Error("Misión no encontrada.");
    }
    const mision = misiones[tipo][indice];
    const repetible = tipo === "diarias" || mision.regular;
    if (repetible && mision.completada_el === fechaHoyLocal) {
      throw new Error("Esta misión ya se completó durante su ciclo actual.");
    }
    if (mision.regular && !(mision.dias_regular || []).includes(new Date(`${fechaHoyLocal}T12:00:00`).getDay())) {
      throw new Error("Hoy no es uno de los días programados para esta misión.");
    }
    if (mision.fases.some((fase) => !fase.completada)) {
      throw new Error("Completa todas las fases antes de cerrar esta misión.");
    }
    const fecha_completada = fechaAhora();
    const registro = { ...JSON.parse(JSON.stringify(mision)), tipo, fecha_completada };
    const historial = leerHistorial();
    historial.push(registro);
    if (repetible) {
      mision.completada_el = fechaHoyLocal;
      mision.fases = mision.fases.map(faseReiniciada);
      mision.notificado_regular_el = "";
    } else {
      misiones[tipo].splice(indice, 1);
    }
    escribirJSON(CLAVE_COMPLETADAS, historial);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, completadas: historial.length, repetible, mision, registro };
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

  async actualizar(tipoOrigen, id, datos) {
    if (!TIPOS_APP.includes(tipoOrigen)) throw new Error("Categoría de misión no válida.");
    const tipoDestino = String(datos.tipo || tipoOrigen);
    if (!TIPOS_APP.includes(tipoDestino)) throw new Error("Categoría de misión no válida.");
    const titulo = String(datos.titulo || "").trim();
    if (!titulo) throw new Error("El título es obligatorio.");
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const indice = misiones[tipoOrigen].findIndex((item) => item.id === id);
    if (indice < 0) throw new Error("Misión no encontrada.");
    const mision = misiones[tipoOrigen][indice];
    const reglas = validarFechasYRegular(datos, mision.fecha_inicio || "");
    const grafo = prepararFases(datos.fases, datos.dependencias, hoyLocal(), mision.fases);
    const fasesAntiguas = new Map(mision.fases.map((fase) => [fase.id, fase]));
    grafo.fases.forEach((fase) => {
      const antigua = fasesAntiguas.get(fase.id);
      if (!antigua) return;
      fase.completada = Boolean(antigua.completada);
      fase.fecha_completada = antigua.fecha_completada || "";
      if (fase.fecha_inicio === antigua.fecha_inicio && fase.hora_aviso_inicio === antigua.hora_aviso_inicio) fase.notificado_inicio = antigua.notificado_inicio || "";
      if (fase.fecha_fin === antigua.fecha_fin && fase.hora_aviso_fin === antigua.hora_aviso_fin) fase.notificado_fin = antigua.notificado_fin || "";
    });
    const fechasOAlertasCambiadas = mision.fecha_inicio !== reglas.inicio
      || mision.fecha_fin !== reglas.fin
      || mision.hora_aviso_inicio !== reglas.horaInicio
      || mision.hora_aviso_fin !== reglas.horaFin;
    Object.assign(mision, {
      titulo: titulo.slice(0, 160),
      descripcion: String(datos.descripcion || "").trim().slice(0, 1000),
      fecha_inicio: reglas.inicio,
      fecha_fin: reglas.fin,
      notificar_inicio: Boolean(datos.notificar_inicio),
      notificar_fin: Boolean(datos.notificar_fin),
      hora_aviso_inicio: reglas.horaInicio,
      hora_aviso_fin: reglas.horaFin,
      regular: reglas.regular,
      dias_regular: reglas.dias,
      hora_regular: reglas.horaRegular,
      notificar_regular: Boolean(datos.notificar_regular && reglas.horaRegular),
      notificado_regular_el: mision.hora_regular !== reglas.horaRegular ? "" : mision.notificado_regular_el,
      fases: grafo.fases,
      dependencias: grafo.dependencias,
    });
    if (fechasOAlertasCambiadas) {
      mision.notificado_inicio = "";
      mision.notificado_fin = "";
    }
    if (tipoDestino !== tipoOrigen) {
      misiones[tipoOrigen].splice(indice, 1);
      misiones[tipoDestino].push(mision);
    }
    if (tipoDestino !== "diarias" && !mision.regular) mision.completada_el = "";
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, tipo: tipoDestino, mision };
  },

  async cancelar(tipo, id) {
    if (!TIPOS_APP.includes(tipo)) throw new Error("Categoría de misión no válida.");
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const indice = misiones[tipo].findIndex((mision) => mision.id === id);
    if (indice < 0) throw new Error("Misión no encontrada.");
    const [mision] = misiones[tipo].splice(indice, 1);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true, mision };
  },

  async historial() {
    return leerHistorial().sort((a, b) => String(b.fecha_completada).localeCompare(String(a.fecha_completada)));
  },

  async marcarNotificada(tipo, id, extremo, fecha, idFase = "") {
    if (!TIPOS_APP.includes(tipo) || !["inicio", "fin", "regular"].includes(extremo)) {
      throw new Error("Datos de notificación no válidos.");
    }
    const misiones = normalizarMisiones(leerJSON(CLAVE_MISIONES, misionesVacias()));
    const mision = misiones[tipo].find((m) => m.id === id);
    if (!mision) throw new Error("Misión no encontrada.");
    const objetivo = idFase ? mision.fases.find((fase) => fase.id === idFase) : mision;
    if (!objetivo) throw new Error("Fase no encontrada.");
    if (extremo === "regular" && idFase) throw new Error("El aviso de recurrencia pertenece a la misión.");
    const campo = extremo === "regular" ? "notificado_regular_el" : `notificado_${extremo}`;
    objetivo[campo] = String(fecha || "").slice(0, 10);
    escribirJSON(CLAVE_MISIONES, misiones);
    return { ok: true };
  },

  async descargarCSV() {
    const completadas = leerHistorial();
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
      completadas: leerHistorial(),
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
