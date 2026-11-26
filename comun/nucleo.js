/* Núcleo de la interfaz. Es idéntico en la versión web y en la versión app.
 * Todo el acceso a datos se delega en `window.Almacen`, que cada versión
 * implementa a su manera (servidor Python o localStorage).
 */

"use strict";

const TIPOS = {
  principales: {
    nombre: "Principales",
    lema: "La ruta crítica de tu campaña. Si esto avanza, todo avanza.",
  },
  secundarias: {
    nombre: "Secundarias",
    lema: "Encargos que suman, sin bloquear la línea principal.",
  },
  campo: {
    nombre: "De Campo",
    lema: "Fuera de casa: recados, gestiones y trabajo de terreno.",
  },
  diarias: {
    nombre: "Diarias",
    lema: "Se repiten cada día. La constancia pesa más que la intensidad.",
  },
};

const ORDEN = ["principales", "secundarias", "campo", "diarias"];

const estado = {
  tipoActivo: "principales",
  misiones: { principales: [], secundarias: [], campo: [], diarias: [] },
  completadas: 0,
  cargando: false,
};

const $ = (sel) => document.querySelector(sel);

let temporizadorAviso = null;
const avisosEmitidosEnSesion = new Set();

/* ---------- Utilidades ---------- */
function formatearFecha(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  const fecha = new Date(a, m - 1, d);
  return fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function textoFechas(mision) {
  const { fecha_inicio, fecha_fin } = mision;
  if (fecha_inicio && fecha_fin) {
    return `${formatearFecha(fecha_inicio)} → ${formatearFecha(fecha_fin)}`;
  }
  if (fecha_inicio) return `Desde ${formatearFecha(fecha_inicio)}`;
  if (fecha_fin) return `Hasta ${formatearFecha(fecha_fin)}`;
  return "";
}

function mostrarAviso(mensaje, tipo = "ok") {
  const aviso = $("#aviso");
  aviso.textContent = mensaje;
  aviso.style.borderLeftColor = tipo === "error" ? "var(--peligro)" : "var(--acento)";
  aviso.hidden = false;
  requestAnimationFrame(() => aviso.classList.add("visible"));
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    aviso.classList.remove("visible");
    setTimeout(() => { aviso.hidden = true; }, 300);
  }, 3200);
}

function mensajeError(error, porDefecto) {
  return (error && error.message) || porDefecto;
}

/* ---------- Render ---------- */
function render() {
  const tipo = estado.tipoActivo;
  const info = TIPOS[tipo];
  const misiones = estado.misiones[tipo] || [];

  document.body.dataset.tipo = tipo;
  $("#titulo-seccion").textContent = info.nombre;
  $("#lema-seccion").textContent = info.lema;
  $("#stat-completadas").textContent = estado.completadas;

  document.querySelectorAll(".pestana").forEach((tab) => {
    const activa = tab.dataset.tipo === tipo;
    tab.classList.toggle("activa", activa);
    tab.setAttribute("aria-selected", activa ? "true" : "false");
  });

  ORDEN.forEach((t) => {
    const contador = document.querySelector(`[data-contador="${t}"]`);
    if (contador) contador.textContent = (estado.misiones[t] || []).length;
  });

  const lista = $("#lista");
  const vacio = $("#vacio");
  lista.innerHTML = "";
  vacio.hidden = misiones.length > 0;

  misiones.forEach((mision) => {
    const li = document.createElement("li");
    li.className = "mision";
    li.dataset.id = mision.id;

    const cuerpo = document.createElement("div");
    cuerpo.className = "mision-cuerpo";

    const titulo = document.createElement("h3");
    titulo.textContent = mision.titulo;
    cuerpo.appendChild(titulo);

    if (mision.descripcion) {
      const desc = document.createElement("p");
      desc.className = "mision-desc";
      desc.textContent = mision.descripcion;
      cuerpo.appendChild(desc);
    }

    const fechas = textoFechas(mision);
    const tieneAvisos = mision.notificar_inicio || mision.notificar_fin;
    if (fechas || tieneAvisos) {
      const meta = document.createElement("div");
      meta.className = "mision-meta";
      if (fechas) {
        const dato = document.createElement("span");
        dato.className = "dato";
        dato.textContent = fechas;
        meta.appendChild(dato);
      }
      if (mision.notificar_inicio) {
        const avisoInicio = document.createElement("span");
        avisoInicio.className = "dato-aviso";
        avisoInicio.textContent = "Aviso de inicio";
        meta.appendChild(avisoInicio);
      }
      if (mision.notificar_fin) {
        const avisoFin = document.createElement("span");
        avisoFin.className = "dato-aviso";
        avisoFin.textContent = "Aviso de fin";
        meta.appendChild(avisoFin);
      }
      cuerpo.appendChild(meta);
    }

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-completar";
    boton.textContent = "Completar";
    boton.addEventListener("click", () => completarMision(tipo, mision, li, boton));

    li.append(cuerpo, boton);
    lista.appendChild(li);
  });
}

/* ---------- Datos ---------- */
async function cargar() {
  if (estado.cargando) return;
  estado.cargando = true;
  try {
    const datos = await Almacen.cargar();
    const misiones = datos.misiones || {};
    ORDEN.forEach((t) => {
      estado.misiones[t] = Array.isArray(misiones[t]) ? misiones[t] : [];
    });
    estado.completadas = Number(datos.completadas) || 0;
    render();
    comprobarAvisosFecha();
  } catch (error) {
    mostrarAviso(mensajeError(error, "No se pudieron cargar las misiones."), "error");
  } finally {
    estado.cargando = false;
  }
}

/* ---------- Acciones ---------- */
async function completarMision(tipo, mision, elemento, boton) {
  boton.disabled = true;
  boton.textContent = "Archivando…";
  try {
    const datos = await Almacen.completar(tipo, mision.id);
    estado.misiones[tipo] = estado.misiones[tipo].filter((m) => m.id !== mision.id);
    estado.completadas = Number.isFinite(datos.completadas)
      ? datos.completadas
      : estado.completadas + 1;
    elemento.classList.add("saliendo");
    setTimeout(() => {
      render();
      mostrarAviso(`«${mision.titulo}» completada y archivada.`);
    }, 300);
  } catch (error) {
    boton.disabled = false;
    boton.textContent = "Completar";
    mostrarAviso(mensajeError(error, "No se pudo completar la misión."), "error");
  }
}

function abrirDialogo() {
  const form = $("#form-mision");
  form.reset();
  actualizarDisponibilidadAvisos();
  $("#form-error").hidden = true;
  $("#dialogo-tipo").textContent = TIPOS[estado.tipoActivo].nombre.toUpperCase();
  $("#dialogo").showModal();
  $("#campo-titulo").focus();
}

function cerrarDialogo() {
  $("#dialogo").close();
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const titulo = $("#campo-titulo").value.trim();
  const descripcion = $("#campo-descripcion").value.trim();
  const inicio = $("#campo-inicio").value;
  const fin = $("#campo-fin").value;

  const formError = $("#form-error");
  const fallo = (mensaje) => {
    formError.textContent = mensaje;
    formError.hidden = false;
  };

  if (!titulo) return fallo("El título es obligatorio.");
  if (inicio && fin && fin < inicio) return fallo("La fecha fin no puede ser anterior a la fecha inicio.");

  const boton = $("#form-mision").querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = "Desplegando…";

  try {
    const datos = await Almacen.crear({
      tipo: estado.tipoActivo,
      titulo,
      descripcion,
      fecha_inicio: inicio,
      fecha_fin: fin,
      notificar_inicio: $("#aviso-inicio").checked,
      notificar_fin: $("#aviso-fin").checked,
    });
    estado.misiones[estado.tipoActivo].push(datos.mision);
    cerrarDialogo();
    render();
    mostrarAviso("Misión desplegada.");
  } catch (error) {
    fallo(mensajeError(error, "No se pudo crear la misión."));
  } finally {
    boton.disabled = false;
    boton.textContent = "Desplegar misión";
  }
}

/* ---------- Avisos por fecha ---------- */
function actualizarDisponibilidadAvisos() {
  const inicio = $("#campo-inicio");
  const fin = $("#campo-fin");
  const avisoInicio = $("#aviso-inicio");
  const avisoFin = $("#aviso-fin");
  avisoInicio.disabled = !inicio.value;
  avisoFin.disabled = !fin.value;
  if (!inicio.value) avisoInicio.checked = false;
  if (!fin.value) avisoFin.checked = false;
}

async function activarAvisoFecha(evento) {
  const control = evento.currentTarget;
  if (!control.checked) return;

  if (!("Notification" in window)) {
    control.checked = false;
    mostrarAviso("Este navegador no permite notificaciones.", "error");
    return;
  }

  try {
    const permiso = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permiso !== "granted") {
      control.checked = false;
      mostrarAviso("No se concedió permiso para mostrar notificaciones.", "error");
      return;
    }
    mostrarAviso("Aviso activado para esa fecha.");
  } catch (_) {
    control.checked = false;
    mostrarAviso("No se pudo solicitar permiso para las notificaciones.", "error");
  }
}

function fechaLocalHoy() {
  const ahora = new Date();
  const desfase = ahora.getTimezoneOffset() * 60000;
  return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
}

async function mostrarNotificacion(titulo, cuerpo, etiqueta) {
  const opciones = {
    body: cuerpo,
    tag: etiqueta,
    icon: "./iconos/icono-192.png",
  };
  if ("serviceWorker" in navigator) {
    const registro = await navigator.serviceWorker.getRegistration();
    if (registro && typeof registro.showNotification === "function") {
      await registro.showNotification(titulo, opciones);
      return;
    }
  }
  new Notification(titulo, opciones);
}

async function comprobarAvisosFecha() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const hoy = fechaLocalHoy();
  for (const tipo of ORDEN) {
    for (const mision of estado.misiones[tipo] || []) {
      for (const extremo of ["inicio", "fin"]) {
        const fecha = mision[`fecha_${extremo}`];
        const habilitado = mision[`notificar_${extremo}`];
        const yaNotificado = mision[`notificado_${extremo}`] === fecha;
        const clave = `${tipo}:${mision.id}:${extremo}:${fecha}`;
        if (!habilitado || !fecha || fecha !== hoy || yaNotificado || avisosEmitidosEnSesion.has(clave)) continue;
        try {
          await mostrarNotificacion(
            extremo === "inicio" ? "Comienza una misión" : "Misión para hoy",
            `${mision.titulo} — ${extremo === "inicio" ? "fecha de inicio" : "fecha de fin"}`,
            clave
          );
          await Almacen.marcarNotificada(tipo, mision.id, extremo, fecha);
          mision[`notificado_${extremo}`] = fecha;
          avisosEmitidosEnSesion.add(clave);
        } catch (error) {
          avisosEmitidosEnSesion.add(clave);
          mostrarAviso(mensajeError(error, "No se pudo mostrar el aviso de fecha."), "error");
        }
      }
    }
  }
}

setInterval(comprobarAvisosFecha, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) comprobarAvisosFecha();
});
window.addEventListener("focus", comprobarAvisosFecha);

async function descargarCSV(evento) {
  if (evento) evento.preventDefault();
  if (estado.completadas === 0) {
    mostrarAviso("Todavía no hay misiones completadas.", "error");
    return;
  }
  try {
    await Almacen.descargarCSV();
  } catch (error) {
    mostrarAviso(mensajeError(error, "No se pudo descargar el CSV."), "error");
  }
}

/* ---------- Instalación (solo app) ---------- */
function configurarInstalacion() {
  const boton = $("#btn-instalar");
  if (!boton) return;

  if (window.matchMedia("(display-mode: standalone)").matches) {
    boton.hidden = true;
    return;
  }

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let promptDiferido = null;

  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    promptDiferido = evento;
  });

  window.addEventListener("appinstalled", () => {
    promptDiferido = null;
    boton.hidden = true;
    mostrarAviso("¡Aplicación instalada!");
  });

  boton.addEventListener("click", async () => {
    if (promptDiferido) {
      promptDiferido.prompt();
      const eleccion = await promptDiferido.userChoice;
      promptDiferido = null;
      if (eleccion && eleccion.outcome === "accepted") {
        mostrarAviso("Instalando la aplicación…");
      }
      return;
    }
    mostrarAviso(
      esIOS
        ? "En iPhone/iPad: Compartir → Añadir a pantalla de inicio."
        : "Abre el menú del navegador → Instalar app / Añadir a pantalla de inicio."
    );
  });
}

/* ---------- Copia de seguridad (solo app) ---------- */
function configurarCopia() {
  const exportar = $("#btn-copia");
  const input = $("#archivo-copia");
  if (!exportar || !input || !Almacen.exportarCopia) return;

  exportar.addEventListener("click", async () => {
    try {
      await Almacen.exportarCopia();
      mostrarAviso("Copia de seguridad descargada.");
    } catch (error) {
      mostrarAviso(mensajeError(error, "No se pudo exportar la copia."), "error");
    }
  });

  input.addEventListener("change", async () => {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);
      const confirmado = window.confirm(
        "Esto sustituirá todas las misiones guardadas en este dispositivo. ¿Continuar?"
      );
      if (!confirmado) return;
      await Almacen.importarCopia(datos);
      await cargar();
      mostrarAviso("Copia restaurada.");
    } catch (error) {
      mostrarAviso(mensajeError(error, "El archivo de copia no es válido."), "error");
    } finally {
      input.value = "";
    }
  });
}

/* ---------- Eventos ---------- */
document.querySelectorAll(".pestana").forEach((tab) => {
  tab.addEventListener("click", () => {
    estado.tipoActivo = tab.dataset.tipo;
    render();
  });
});

$("#btn-nueva").addEventListener("click", abrirDialogo);
$("#btn-cerrar").addEventListener("click", cerrarDialogo);
$("#btn-cancelar").addEventListener("click", cerrarDialogo);
$("#form-mision").addEventListener("submit", enviarFormulario);
$("#btn-csv").addEventListener("click", descargarCSV);
$("#campo-inicio").addEventListener("change", actualizarDisponibilidadAvisos);
$("#campo-fin").addEventListener("change", actualizarDisponibilidadAvisos);
$("#aviso-inicio").addEventListener("change", activarAvisoFecha);
$("#aviso-fin").addEventListener("change", activarAvisoFecha);
$("#btn-anadir-fase").addEventListener("click", () => {
  mostrarAviso("La creación de fases estará disponible en una próxima actualización.");
});

$("#dialogo").addEventListener("click", (evento) => {
  if (evento.target === $("#dialogo")) cerrarDialogo();
});

configurarInstalacion();
configurarCopia();
cargar();
