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
  historial: [],
  completadas: 0,
  cargando: false,
};

let fasesGuardadasEnBorrador = [];
let dependenciasGuardadasEnBorrador = [];
let editorFases = [];
let editorDependencias = [];
let modoEditorFases = "idle";
let faseConectadaDesde = "";
let faseArrastrada = null;
let faseEnEdicion = null;
let misionEnEdicion = null;
let misionEnEdicionGrado = null; // legado del diálogo anterior de categoría
const fasesDesplegadas = new Set();

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

function faseEsActiva(mision, fase) {
  const previas = (mision.dependencias || []).filter((arista) => arista.hasta === fase.id);
  if (!previas.length) return true;
  return previas.every((arista) => {
    const previa = (mision.fases || []).find((item) => item.id === arista.desde);
    return previa && previa.completada;
  });
}

function fasesActivas(mision) {
  return (mision.fases || []).filter((fase) => !fase.completada && faseEsActiva(mision, fase));
}

function fasesCompletadas(mision) {
  return (mision.fases || []).filter((fase) => fase.completada).length;
}

function misionVisible(tipo, mision) {
  const hoy = fechaLocalHoy();
  const repetible = tipo === "diarias" || mision.regular;
  if (!repetible) return true;
  if (mision.completada_el === hoy) return false;
  if (mision.regular) {
    const dia = new Date().getDay();
    return (mision.dias_regular || []).includes(dia);
  }
  return true;
}

function porcentajeFases(mision) {
  const fases = mision.fases || [];
  const total = fases.reduce((suma, fase) => suma + Math.max(0, Number(fase.valor ?? 1)), 0);
  if (!fases.length) return 0;
  if (total === 0) return fases.every((fase) => fase.completada) ? 100 : 0;
  const completado = fases.reduce((suma, fase) => suma + (fase.completada ? Math.max(0, Number(fase.valor ?? 1)) : 0), 0);
  return Math.round((completado / total) * 100);
}

/* ---------- Render ---------- */
function render() {
  const tipo = estado.tipoActivo;
  const info = TIPOS[tipo];
  const misiones = (estado.misiones[tipo] || []).filter((mision) => misionVisible(tipo, mision));

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
    if (contador) contador.textContent = (estado.misiones[t] || []).filter((mision) => misionVisible(t, mision)).length;
  });

  const lista = $("#lista");
  const vacio = $("#vacio");
  lista.querySelectorAll(".mision-fases[open]").forEach((desplegable) => {
    fasesDesplegadas.add(desplegable.closest(".mision")?.dataset.id);
  });
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
    const tieneRecurrencia = tipo === "diarias" || mision.regular;
    if (fechas || tieneAvisos || tieneRecurrencia) {
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
      if (tieneRecurrencia) {
        const recurrencia = document.createElement("span");
        recurrencia.className = "dato-recurrente";
        recurrencia.textContent = mision.regular
          ? `Regular · ${(mision.dias_regular || []).map((dia) => ["D", "L", "M", "X", "J", "V", "S"][dia]).join(" ")}${mision.hora_regular ? ` · ${mision.hora_regular}` : ""}`
          : "Diaria · cada día";
        meta.appendChild(recurrencia);
      }
      cuerpo.appendChild(meta);
    }

    const fases = Array.isArray(mision.fases) ? mision.fases : [];
    const activas = fasesActivas(mision);
    if (fases.length) {
      const progreso = document.createElement("div");
      progreso.className = "progreso-mision";
      const progresoCabecera = document.createElement("div");
      progresoCabecera.className = "progreso-mision-cabecera";
      const progresoEtiqueta = document.createElement("span");
      progresoEtiqueta.textContent = "Progreso ponderado";
      const progresoValor = document.createElement("strong");
      progresoValor.textContent = `${porcentajeFases(mision)}%`;
      progresoCabecera.append(progresoEtiqueta, progresoValor);
      const barra = document.createElement("div");
      barra.className = "progreso-mision-barra";
      const relleno = document.createElement("span");
      relleno.style.width = `${porcentajeFases(mision)}%`;
      barra.appendChild(relleno);
      progreso.append(progresoCabecera, barra);
      cuerpo.appendChild(progreso);

      const desplegable = document.createElement("details");
      desplegable.className = "mision-fases";
      desplegable.open = fasesDesplegadas.has(mision.id);
      desplegable.addEventListener("toggle", () => {
        if (!desplegable.isConnected) return;
        if (desplegable.open) fasesDesplegadas.add(mision.id);
        else fasesDesplegadas.delete(mision.id);
      });
      const resumen = document.createElement("summary");
      resumen.textContent = `Fases · ${activas.length} activas · ${fasesCompletadas(mision)}/${fases.length} completadas`;
      desplegable.appendChild(resumen);
      const listaFases = document.createElement("ul");
      listaFases.className = "lista-fases-activas";
      activas.forEach((fase) => {
        const fila = document.createElement("li");
        fila.className = "fase-activa";
        const infoFase = document.createElement("div");
        infoFase.className = "fase-activa-info";
        const tituloFase = document.createElement("strong");
        tituloFase.textContent = fase.titulo;
        infoFase.appendChild(tituloFase);
        if (fase.descripcion) {
          const descFase = document.createElement("p");
          descFase.textContent = fase.descripcion;
          infoFase.appendChild(descFase);
        }
        const datosFase = [];
        const fechasFase = textoFechas(fase);
        if (fechasFase) datosFase.push(fechasFase);
        datosFase.push(`Valor ${Number(fase.valor ?? 1)}`);
        const metaFase = document.createElement("small");
        metaFase.textContent = datosFase.join(" · ");
        infoFase.appendChild(metaFase);
        const completarFase = document.createElement("button");
        completarFase.type = "button";
        completarFase.className = "btn-completar-fase";
        completarFase.textContent = "Completar fase";
        completarFase.addEventListener("click", () => completarFaseMision(tipo, mision, fase, completarFase));
        fila.append(infoFase, completarFase);
        listaFases.appendChild(fila);
      });
      if (!activas.length) {
        const vacia = document.createElement("li");
        vacia.className = "fases-sin-activas";
        vacia.textContent = "Todas las fases están completadas.";
        listaFases.appendChild(vacia);
      }
      desplegable.appendChild(listaFases);
      cuerpo.appendChild(desplegable);
    }

    const acciones = document.createElement("div");
    acciones.className = "mision-acciones";
    const ajustar = document.createElement("button");
    ajustar.type = "button";
    ajustar.className = "btn-ajustes-mision";
    ajustar.textContent = "⚙";
    ajustar.title = "Ajustes de misión";
    ajustar.setAttribute("aria-label", "Ajustes de misión");
    ajustar.addEventListener("click", () => abrirAjustesMision(tipo, mision));
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-completar";
    const fasesPendientes = fases.length > 0 && fasesCompletadas(mision) < fases.length;
    boton.textContent = fasesPendientes ? "Completa las fases" : "Completar";
    boton.disabled = fasesPendientes;
    if (fasesPendientes) boton.title = "Completa todas las fases activas antes de cerrar esta misión.";
    boton.addEventListener("click", () => completarMision(tipo, mision, li, boton));

    acciones.append(ajustar, boton);
    li.append(cuerpo, acciones);
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
    estado.historial = Array.isArray(datos.historial) ? datos.historial : [];
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
  if ((mision.fases || []).some((fase) => !fase.completada)) {
    mostrarAviso("Completa todas las fases antes de cerrar esta misión.", "error");
    return;
  }
  boton.disabled = true;
  boton.textContent = "Archivando…";
  try {
    const datos = await Almacen.completar(tipo, mision.id, fechaLocalHoy());
    if (datos.repetible) Object.assign(mision, datos.mision);
    else estado.misiones[tipo] = estado.misiones[tipo].filter((m) => m.id !== mision.id);
    if (datos.registro) estado.historial.unshift(datos.registro);
    estado.completadas = Number.isFinite(datos.completadas)
      ? datos.completadas
      : estado.completadas + 1;
    elemento.classList.add("saliendo");
    setTimeout(() => {
      render();
      mostrarAviso(datos.repetible ? `«${mision.titulo}» completada. Volverá a activarse según su frecuencia.` : `«${mision.titulo}» completada y archivada.`);
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
  document.querySelectorAll(".ajustes-avanzados").forEach((details) => { details.open = false; });
  misionEnEdicion = null;
  fasesGuardadasEnBorrador = [];
  dependenciasGuardadasEnBorrador = [];
  actualizarBotonFases();
  $("#dialogo-titulo").textContent = "Nueva misión";
  $("#btn-guardar-mision").textContent = "Desplegar misión";
  $("#btn-cancelar-mision").hidden = true;
  $("#campo-tipo").value = estado.tipoActivo;
  actualizarControlesRegular();
  actualizarDisponibilidadAvisos();
  $("#form-error").hidden = true;
  $("#dialogo-tipo").textContent = TIPOS[estado.tipoActivo].nombre.toUpperCase();
  $("#dialogo").showModal();
  $("#campo-titulo").focus();
}

function abrirAjustesMision(tipo, mision) {
  misionEnEdicion = { tipo, id: mision.id, mision };
  const form = $("#form-mision");
  form.reset();
  document.querySelectorAll(".ajustes-avanzados").forEach((details) => { details.open = false; });
  $("#campo-titulo").value = mision.titulo || "";
  $("#campo-descripcion").value = mision.descripcion || "";
  $("#campo-inicio").value = mision.fecha_inicio || "";
  $("#campo-fin").value = mision.fecha_fin || "";
  $("#campo-hora-inicio").value = mision.hora_aviso_inicio || "00:00";
  $("#campo-hora-fin").value = mision.hora_aviso_fin || "23:59";
  $("#aviso-inicio").checked = Boolean(mision.notificar_inicio);
  $("#aviso-fin").checked = Boolean(mision.notificar_fin);
  $("#campo-tipo").value = tipo;
  $("#campo-regular").checked = Boolean(mision.regular);
  $("#regular-opciones").hidden = !mision.regular;
  $("#campo-hora-regular").value = mision.hora_regular || "";
  $("#campo-aviso-regular").checked = Boolean(mision.notificar_regular);
  actualizarControlesRegular();
  document.querySelectorAll(".dia-regular").forEach((control) => {
    control.checked = (mision.dias_regular || []).includes(Number(control.value));
  });
  fasesGuardadasEnBorrador = clonar(mision.fases || []);
  dependenciasGuardadasEnBorrador = clonar(mision.dependencias || []);
  actualizarBotonFases();
  actualizarDisponibilidadAvisos();
  $("#form-error").hidden = true;
  $("#dialogo-tipo").textContent = TIPOS[tipo].nombre.toUpperCase();
  $("#dialogo-titulo").textContent = "Ajustes de misión";
  $("#btn-guardar-mision").textContent = "Guardar cambios";
  $("#btn-cancelar-mision").hidden = false;
  $("#dialogo").showModal();
  $("#campo-titulo").focus();
}

function cerrarDialogo() {
  $("#dialogo").close();
  misionEnEdicion = null;
}

/* ---------- Constructor visual de fases ---------- */
const LIENZO_ANCHO = 1180;
const LIENZO_ALTO = 620;
const FASE_ANCHO = 250;
const FASE_ALTO = 142;

function clonar(datos) {
  return JSON.parse(JSON.stringify(datos || []));
}

function nuevoIdFase() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function actualizarBotonFases() {
  const boton = $("#btn-anadir-fase");
  if (!boton) return;
  boton.textContent = fasesGuardadasEnBorrador.length
    ? `Editar fases (${fasesGuardadasEnBorrador.length})`
    : "＋ Añadir fases";
}

function abrirEditorFases() {
  editorFases = clonar(fasesGuardadasEnBorrador);
  editorDependencias = clonar(dependenciasGuardadasEnBorrador);
  modoEditorFases = "idle";
  faseConectadaDesde = "";
  $("#editor-error").hidden = true;
  actualizarModoEditor();
  renderEditorFases();
  $("#lienzo-scroll").scrollLeft = 0;
  $("#lienzo-scroll").scrollTop = 0;
  $("#dialogo-editor-fases").showModal();
}

function cancelarEditorFases() {
  modoEditorFases = "idle";
  faseConectadaDesde = "";
  if ($("#dialogo-editor-fases").open) $("#dialogo-editor-fases").close();
}

function actualizarModoEditor() {
  const conectar = $("#btn-conectar-fases");
  const borrar = $("#btn-borrar-flecha");
  conectar.classList.toggle("activo", modoEditorFases === "connect");
  borrar.classList.toggle("activo", modoEditorFases === "deleteEdge");
  conectar.setAttribute("aria-pressed", modoEditorFases === "connect" ? "true" : "false");
  borrar.setAttribute("aria-pressed", modoEditorFases === "deleteEdge" ? "true" : "false");
  $("#lienzo-fases").classList.toggle("modo-borrar-flecha", modoEditorFases === "deleteEdge");
  if (modoEditorFases === "add") {
    $("#editor-modo").textContent = "Pulsa en el lienzo para colocar la fase.";
  } else if (modoEditorFases === "connect") {
    $("#editor-modo").textContent = faseConectadaDesde
      ? "Arrastra desde la fase seleccionada hasta su sucesora."
      : "Arrastra desde la fase anterior hasta la siguiente.";
  } else if (modoEditorFases === "deleteEdge") {
    $("#editor-modo").textContent = "Pulsa una flecha del lienzo para eliminarla.";
  } else {
    $("#editor-modo").textContent = "Arrastra las fases para ordenarlas; usa ⚙ para editarlas.";
  }
}

function errorEditor(mensaje) {
  const elemento = $("#editor-error");
  elemento.textContent = mensaje;
  elemento.hidden = false;
}

function crearFaseEnLienzo(evento) {
  if (modoEditorFases !== "add" || evento.target.closest(".fase-nodo")) return;
  const lienzo = $("#lienzo-fases");
  const rect = lienzo.getBoundingClientRect();
  const x = Math.max(12, Math.min(LIENZO_ANCHO - FASE_ANCHO - 12, evento.clientX - rect.left - FASE_ANCHO / 2));
  const y = Math.max(12, Math.min(LIENZO_ALTO - FASE_ALTO - 12, evento.clientY - rect.top - FASE_ALTO / 2));
  const numero = editorFases.length + 1;
  editorFases.push({
    id: nuevoIdFase(),
    titulo: `Fase ${numero}`,
    descripcion: "",
    fecha_inicio: "",
    fecha_fin: "",
    notificar_inicio: false,
    notificar_fin: false,
    notificado_inicio: "",
    notificado_fin: "",
    valor: 1,
    x: Math.round(x),
    y: Math.round(y),
    completada: false,
    fecha_completada: "",
  });
  modoEditorFases = "idle";
  $("#editor-error").hidden = true;
  actualizarModoEditor();
  renderEditorFases();
}

function renderEditorFases() {
  const nodos = $("#lienzo-nodos");
  const svg = $("#lienzo-flechas");
  $("#lienzo-fases").classList.toggle("modo-borrar-flecha", modoEditorFases === "deleteEdge");
  nodos.innerHTML = "";
  nodos.style.width = `${LIENZO_ANCHO}px`;
  nodos.style.height = `${LIENZO_ALTO}px`;
  svg.setAttribute("viewBox", `0 0 ${LIENZO_ANCHO} ${LIENZO_ALTO}`);
  svg.setAttribute("width", LIENZO_ANCHO);
  svg.setAttribute("height", LIENZO_ALTO);
  svg.replaceChildren();

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "punta-flecha-fase");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const punta = document.createElementNS("http://www.w3.org/2000/svg", "path");
  punta.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  punta.setAttribute("fill", "var(--acento)");
  marker.appendChild(punta);
  defs.appendChild(marker);
  svg.appendChild(defs);

  editorDependencias.forEach((arista) => {
    const desde = editorFases.find((fase) => fase.id === arista.desde);
    const hasta = editorFases.find((fase) => fase.id === arista.hasta);
    if (!desde || !hasta) return;
    const origenDerecha = hasta.x >= desde.x + FASE_ANCHO / 2;
    const x1 = desde.x + (origenDerecha ? FASE_ANCHO : 0);
    const y1 = desde.y + FASE_ALTO / 2;
    const x2 = hasta.x + (origenDerecha ? 0 : FASE_ANCHO);
    const y2 = hasta.y + FASE_ALTO / 2;
    const control = (x1 + x2) / 2;
    const camino = document.createElementNS("http://www.w3.org/2000/svg", "path");
    camino.setAttribute("d", `M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}`);
    camino.setAttribute("class", "flecha-fase");
    camino.setAttribute("marker-end", "url(#punta-flecha-fase)");
    camino.addEventListener("click", (evento) => eliminarFlechaEditor(evento, arista));
    svg.appendChild(camino);
  });

  editorFases.forEach((fase, indice) => {
    const nodo = document.createElement("article");
    nodo.className = "fase-nodo";
    if (faseConectadaDesde === fase.id) nodo.classList.add("fase-seleccionada");
    nodo.dataset.id = fase.id;
    nodo.style.left = `${fase.x}px`;
    nodo.style.top = `${fase.y}px`;

    const cabecera = document.createElement("div");
    cabecera.className = "fase-nodo-cabecera";
    const arrastre = document.createElement("span");
    arrastre.className = "fase-nodo-numero";
    arrastre.textContent = `FASE ${indice + 1}`;
    const ajustes = document.createElement("button");
    ajustes.type = "button";
    ajustes.className = "fase-nodo-ajustes";
    ajustes.textContent = "⚙";
    ajustes.title = "Ajustes de esta fase";
    ajustes.setAttribute("aria-label", `Ajustes de ${fase.titulo}`);
    ajustes.addEventListener("click", (evento) => {
      evento.stopPropagation();
      abrirAjustesFase(fase.id);
    });
    cabecera.append(arrastre, ajustes);
    const titulo = document.createElement("strong");
    titulo.className = "fase-nodo-titulo";
    titulo.textContent = fase.titulo || `Fase ${indice + 1}`;
    const fechas = document.createElement("small");
    fechas.className = "fase-nodo-fechas";
    fechas.textContent = textoFechas(fase) || "Sin fechas";
    const valor = document.createElement("small");
    valor.className = "fase-nodo-valor";
    valor.textContent = `Valor · ${Number(fase.valor ?? 1)}`;
    nodo.append(cabecera, titulo, fechas, valor);
    nodo.addEventListener("pointerdown", (evento) => manejarInicioArrastreFase(evento, fase.id, nodo));
    nodo.addEventListener("pointermove", manejarMovimientoArrastreFase);
    nodo.addEventListener("pointerup", terminarArrastreFase);
    nodo.addEventListener("pointercancel", terminarArrastreFase);
    nodos.appendChild(nodo);
  });
}

function manejarInicioArrastreFase(evento, id, nodo) {
  if (evento.target.closest("button")) return;
  if (modoEditorFases === "add" || modoEditorFases === "deleteEdge") return;
  if (modoEditorFases === "connect") {
    evento.preventDefault();
    if (!faseConectadaDesde) {
      faseConectadaDesde = id;
      nodo.classList.add("fase-seleccionada");
      actualizarModoEditor();
    }
    return;
  }
  evento.preventDefault();
  const fase = editorFases.find((item) => item.id === id);
  const rect = $("#lienzo-fases").getBoundingClientRect();
  faseArrastrada = {
    id,
    pointerId: evento.pointerId,
    offsetX: evento.clientX - rect.left - fase.x,
    offsetY: evento.clientY - rect.top - fase.y,
    nodo,
  };
  nodo.classList.add("fase-arrastrando");
  nodo.setPointerCapture(evento.pointerId);
}

function manejarMovimientoArrastreFase(evento) {
  if (!faseArrastrada || evento.pointerId !== faseArrastrada.pointerId) return;
  const rect = $("#lienzo-fases").getBoundingClientRect();
  const fase = editorFases.find((item) => item.id === faseArrastrada.id);
  if (!fase) return;
  fase.x = Math.round(Math.max(8, Math.min(LIENZO_ANCHO - FASE_ANCHO - 8, evento.clientX - rect.left - faseArrastrada.offsetX)));
  fase.y = Math.round(Math.max(8, Math.min(LIENZO_ALTO - FASE_ALTO - 8, evento.clientY - rect.top - faseArrastrada.offsetY)));
  faseArrastrada.nodo.style.left = `${fase.x}px`;
  faseArrastrada.nodo.style.top = `${fase.y}px`;
  renderFlechasFases();
}

function terminarArrastreFase(evento) {
  if (!faseArrastrada || evento.pointerId !== faseArrastrada.pointerId) return;
  faseArrastrada.nodo.classList.remove("fase-arrastrando");
  faseArrastrada = null;
}

function renderFlechasFases() {
  const svg = $("#lienzo-flechas");
  const marker = svg.querySelector("defs");
  svg.replaceChildren(marker);
  editorDependencias.forEach((arista) => {
    const desde = editorFases.find((fase) => fase.id === arista.desde);
    const hasta = editorFases.find((fase) => fase.id === arista.hasta);
    if (!desde || !hasta) return;
    const haciaDerecha = hasta.x >= desde.x + FASE_ANCHO / 2;
    const x1 = desde.x + (haciaDerecha ? FASE_ANCHO : 0);
    const y1 = desde.y + FASE_ALTO / 2;
    const x2 = hasta.x + (haciaDerecha ? 0 : FASE_ANCHO);
    const y2 = hasta.y + FASE_ALTO / 2;
    const control = (x1 + x2) / 2;
    const camino = document.createElementNS("http://www.w3.org/2000/svg", "path");
    camino.setAttribute("d", `M ${x1} ${y1} C ${control} ${y1}, ${control} ${y2}, ${x2} ${y2}`);
    camino.setAttribute("class", "flecha-fase");
    camino.setAttribute("marker-end", "url(#punta-flecha-fase)");
    camino.addEventListener("click", (evento) => eliminarFlechaEditor(evento, arista));
    svg.appendChild(camino);
  });
}

function eliminarFlechaEditor(evento, arista) {
  if (modoEditorFases !== "deleteEdge") return;
  evento.preventDefault();
  evento.stopPropagation();
  editorDependencias = editorDependencias.filter((item) => item.desde !== arista.desde || item.hasta !== arista.hasta);
  $("#editor-error").hidden = true;
  renderEditorFases();
}

function hayCaminoFase(origen, destino) {
  const pendientes = [origen];
  const visitadas = new Set();
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (actual === destino) return true;
    if (visitadas.has(actual)) continue;
    visitadas.add(actual);
    editorDependencias.filter((arista) => arista.desde === actual).forEach((arista) => pendientes.push(arista.hasta));
  }
  return false;
}

function conectarFases(desde, hasta) {
  if (!desde || !hasta || desde === hasta) {
    errorEditor("Una fase no puede apuntar a sí misma.");
    return false;
  }
  if (editorDependencias.some((arista) => arista.desde === desde && arista.hasta === hasta)) {
    errorEditor("Esa flecha ya existe.");
    return false;
  }
  if (hayCaminoFase(hasta, desde)) {
    errorEditor("Esa flecha crearía un ciclo. Las fases deben avanzar en una dirección sin bucles.");
    return false;
  }
  editorDependencias.push({ desde, hasta });
  $("#editor-error").hidden = true;
  return true;
}

function completarConexion(evento) {
  if (modoEditorFases !== "connect" || !faseConectadaDesde) return;
  if (evento.target.closest("button")) return;
  const destino = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(".fase-nodo")?.dataset.id;
  if (destino && destino !== faseConectadaDesde) {
    conectarFases(faseConectadaDesde, destino);
    faseConectadaDesde = "";
    renderEditorFases();
    actualizarModoEditor();
  }
}

function abrirAjustesFase(id) {
  faseEnEdicion = editorFases.find((fase) => fase.id === id);
  if (!faseEnEdicion) return;
  $("#ajuste-fase-titulo").value = faseEnEdicion.titulo || "";
  $("#ajuste-fase-descripcion").value = faseEnEdicion.descripcion || "";
  $("#ajuste-fase-inicio").value = faseEnEdicion.fecha_inicio || "";
  $("#ajuste-fase-fin").value = faseEnEdicion.fecha_fin || "";
  $("#ajuste-fase-hora-inicio").value = faseEnEdicion.hora_aviso_inicio || "00:00";
  $("#ajuste-fase-hora-fin").value = faseEnEdicion.hora_aviso_fin || "23:59";
  actualizarFechasAjusteFase();
  $("#ajuste-fase-aviso-inicio").checked = Boolean(faseEnEdicion.notificar_inicio);
  $("#ajuste-fase-aviso-fin").checked = Boolean(faseEnEdicion.notificar_fin);
  $("#ajuste-fase-valor").value = Number(faseEnEdicion.valor ?? 1);
  actualizarControlesAvisoAjusteFase();
  $("#ajuste-fase-error").hidden = true;
  $("#dialogo-ajuste-fase").showModal();
  $("#ajuste-fase-titulo").focus();
}

function guardarAjustesFase(evento) {
  evento.preventDefault();
  if (!faseEnEdicion) return;
  const titulo = $("#ajuste-fase-titulo").value.trim();
  const inicio = $("#ajuste-fase-inicio").value;
  const fin = $("#ajuste-fase-fin").value;
  const valor = Number($("#ajuste-fase-valor").value);
  const error = $("#ajuste-fase-error");
  const fallo = (mensaje) => { error.textContent = mensaje; error.hidden = false; };
  if (!titulo) return fallo("El título de la fase es obligatorio.");
  if (inicio && inicio < fechaLocalHoy() && inicio !== (faseEnEdicion.fecha_inicio || "")) return fallo("La fecha inicio de la fase no puede ser anterior a hoy.");
  if (inicio && fin && fin < inicio) return fallo("La fecha fin no puede ser anterior a la fecha inicio.");
  const horaInicio = $("#ajuste-fase-hora-inicio").value || "00:00";
  const horaFin = $("#ajuste-fase-hora-fin").value || "23:59";
  if (inicio && fin && inicio === fin && horaFin <= horaInicio) return fallo("La hora fin debe ser posterior a la hora de inicio si comparten fecha.");
  if (!Number.isFinite(valor) || valor < 0) return fallo("El peso o valor debe ser un número igual o mayor que cero.");

  Object.assign(faseEnEdicion, {
    titulo,
    descripcion: $("#ajuste-fase-descripcion").value.trim(),
    fecha_inicio: inicio,
    fecha_fin: fin,
    hora_aviso_inicio: horaInicio,
    hora_aviso_fin: horaFin,
    notificar_inicio: $("#ajuste-fase-aviso-inicio").checked,
    notificar_fin: $("#ajuste-fase-aviso-fin").checked,
    valor,
  });
  $("#dialogo-ajuste-fase").close();
  faseEnEdicion = null;
  renderEditorFases();
}

function eliminarFaseEnEdicion() {
  if (!faseEnEdicion) return;
  const id = faseEnEdicion.id;
  editorFases = editorFases.filter((fase) => fase.id !== id);
  editorDependencias = editorDependencias.filter((arista) => arista.desde !== id && arista.hasta !== id);
  $("#dialogo-ajuste-fase").close();
  faseEnEdicion = null;
  renderEditorFases();
}

function actualizarControlesAvisoAjusteFase() {
  const inicio = $("#ajuste-fase-inicio").value;
  const fin = $("#ajuste-fase-fin").value;
  const avisoInicio = $("#ajuste-fase-aviso-inicio");
  const avisoFin = $("#ajuste-fase-aviso-fin");
  avisoInicio.disabled = !inicio;
  avisoFin.disabled = !fin;
  $("#ajuste-fase-hora-inicio").disabled = !inicio || !avisoInicio.checked;
  $("#ajuste-fase-hora-fin").disabled = !fin || !avisoFin.checked;
  if (!inicio) avisoInicio.checked = false;
  if (!fin) avisoFin.checked = false;
}

function confirmarEditorFases() {
  if (editorFases.some((fase) => !fase.titulo.trim())) {
    errorEditor("Cada fase necesita un título. Revisa sus ajustes ⚙.");
    return;
  }
  fasesGuardadasEnBorrador = clonar(editorFases);
  dependenciasGuardadasEnBorrador = clonar(editorDependencias);
  actualizarBotonFases();
  $("#dialogo-editor-fases").close();
  mostrarAviso(`${fasesGuardadasEnBorrador.length} fase(s) añadida(s) al borrador de misión.`);
}

/* ---------- Cambio de categoría de una misión ---------- */
function abrirAjustesGrado(tipo, mision) {
  misionEnEdicionGrado = { tipo, mision };
  $("#grado-destino").value = tipo;
  $("#grado-error").hidden = true;
  $("#dialogo-grado").showModal();
}

async function guardarGrado(evento) {
  evento.preventDefault();
  if (!misionEnEdicionGrado) return;
  const destino = $("#grado-destino").value;
  const { tipo, mision } = misionEnEdicionGrado;
  if (destino === tipo) {
    $("#dialogo-grado").close();
    misionEnEdicionGrado = null;
    return;
  }
  const boton = $("#form-grado button[type=submit]");
  boton.disabled = true;
  try {
    await Almacen.cambiarTipo(tipo, mision.id, destino);
    estado.misiones[tipo] = estado.misiones[tipo].filter((item) => item.id !== mision.id);
    estado.misiones[destino].push(mision);
    $("#dialogo-grado").close();
    misionEnEdicionGrado = null;
    render();
    mostrarAviso(`Misión trasladada a ${TIPOS[destino].nombre}.`);
  } catch (error) {
    const salida = $("#grado-error");
    salida.textContent = mensajeError(error, "No se pudo cambiar la categoría.");
    salida.hidden = false;
  } finally {
    boton.disabled = false;
  }
}

async function completarFaseMision(tipo, mision, fase, boton) {
  boton.disabled = true;
  try {
    const datos = await Almacen.completarFase(tipo, mision.id, fase.id);
    const faseActualizada = (mision.fases || []).find((item) => item.id === fase.id);
    if (faseActualizada) Object.assign(faseActualizada, datos.fase || { completada: true });
    render();
    mostrarAviso(`Fase «${fase.titulo}» completada.`);
  } catch (error) {
    boton.disabled = false;
    mostrarAviso(mensajeError(error, "No se pudo completar la fase."), "error");
  }
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const formError = $("#form-error");
  const fallo = (mensaje) => {
    formError.textContent = mensaje;
    formError.hidden = false;
  };
  const datos = {
    titulo: $("#campo-titulo").value.trim(),
    descripcion: $("#campo-descripcion").value.trim(),
    fecha_inicio: $("#campo-inicio").value,
    fecha_fin: $("#campo-fin").value,
    hora_aviso_inicio: $("#campo-hora-inicio").value || "00:00",
    hora_aviso_fin: $("#campo-hora-fin").value || "23:59",
    notificar_inicio: $("#aviso-inicio").checked,
    notificar_fin: $("#aviso-fin").checked,
    tipo: $("#campo-tipo").value,
    regular: $("#campo-regular").checked,
    dias_regular: Array.from(document.querySelectorAll(".dia-regular:checked"), (control) => Number(control.value)),
    hora_regular: $("#campo-hora-regular").value,
    notificar_regular: $("#campo-aviso-regular").checked,
    fecha_hoy_local: fechaLocalHoy(),
    fases: fasesGuardadasEnBorrador,
    dependencias: dependenciasGuardadasEnBorrador,
  };

  if (!datos.titulo) return fallo("El título es obligatorio.");
  const fechaInicioAntiguaPermitida = misionEnEdicion
    && datos.fecha_inicio === (misionEnEdicion.mision.fecha_inicio || "");
  if (datos.fecha_inicio && datos.fecha_inicio < fechaLocalHoy() && !fechaInicioAntiguaPermitida) {
    return fallo("La fecha inicio no puede ser anterior a hoy.");
  }
  if (datos.fecha_inicio && datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
    return fallo("La fecha fin no puede ser anterior a la fecha inicio.");
  }
  if (datos.fecha_inicio && datos.fecha_fin && datos.fecha_inicio === datos.fecha_fin
      && datos.hora_aviso_fin <= datos.hora_aviso_inicio) {
    return fallo("Si inicio y fin coinciden, la hora fin debe ser posterior a la hora inicio.");
  }
  if (datos.regular && datos.dias_regular.length === 0) {
    return fallo("Selecciona al menos un día para la misión regular.");
  }

  const boton = $("#form-mision").querySelector('button[type="submit"]');
  const estabaEditando = Boolean(misionEnEdicion);
  boton.disabled = true;
  boton.textContent = estabaEditando ? "Guardando…" : "Desplegando…";

  try {
    if (misionEnEdicion) {
      const { tipo: tipoOrigen, id } = misionEnEdicion;
      const resultado = await Almacen.actualizar(tipoOrigen, id, datos);
      estado.misiones[tipoOrigen] = estado.misiones[tipoOrigen].filter((m) => m.id !== id);
      estado.misiones[resultado.tipo].push(resultado.mision);
    } else {
      const resultado = await Almacen.crear({ ...datos, tipo: datos.tipo || estado.tipoActivo });
      estado.misiones[datos.tipo || estado.tipoActivo].push(resultado.mision);
    }
    actualizarBotonFases();
    cerrarDialogo();
    render();
    mostrarAviso(estabaEditando ? "Ajustes de misión guardados." : "Misión desplegada.");
  } catch (error) {
    fallo(mensajeError(error, "No se pudo crear la misión."));
  } finally {
    boton.disabled = false;
    boton.textContent = misionEnEdicion ? "Guardar cambios" : "Desplegar misión";
  }
}

async function cancelarMisionActual() {
  if (!misionEnEdicion) return;
  if (!window.confirm(`¿Cancelar la misión «${misionEnEdicion.mision.titulo}»? Esta acción la quitará de las misiones activas.`)) return;
  const { tipo, id } = misionEnEdicion;
  try {
    await Almacen.cancelar(tipo, id);
    estado.misiones[tipo] = estado.misiones[tipo].filter((mision) => mision.id !== id);
    cerrarDialogo();
    render();
    mostrarAviso("Misión cancelada.");
  } catch (error) {
    const formError = $("#form-error");
    formError.textContent = mensajeError(error, "No se pudo cancelar la misión.");
    formError.hidden = false;
  }
}

/* ---------- Avisos por fecha ---------- */
function actualizarDisponibilidadAvisos() {
  const inicio = $("#campo-inicio");
  const fin = $("#campo-fin");
  const avisoInicio = $("#aviso-inicio");
  const avisoFin = $("#aviso-fin");
  const inicioAnterior = misionEnEdicion && misionEnEdicion.mision.fecha_inicio;
  inicio.min = inicioAnterior && inicioAnterior < fechaLocalHoy() && inicio.value === inicioAnterior
    ? inicioAnterior
    : fechaLocalHoy();
  fin.min = inicio.value || "";
  avisoInicio.disabled = !inicio.value;
  avisoFin.disabled = !fin.value;
  $("#campo-hora-inicio").disabled = !inicio.value || !avisoInicio.checked;
  $("#campo-hora-fin").disabled = !fin.value || !avisoFin.checked;
  if (!inicio.value) avisoInicio.checked = false;
  if (!fin.value) avisoFin.checked = false;
}

function actualizarControlesRegular() {
  const regular = $("#campo-regular").checked;
  const hora = $("#campo-hora-regular");
  const aviso = $("#campo-aviso-regular");
  $("#regular-opciones").hidden = !regular;
  hora.disabled = !regular;
  aviso.disabled = !regular || !hora.value;
  if (!regular || !hora.value) aviso.checked = false;
}

function actualizarFechasAjusteFase() {
  const inicio = $("#ajuste-fase-inicio");
  const fin = $("#ajuste-fase-fin");
  const anterior = faseEnEdicion && faseEnEdicion.fecha_inicio;
  inicio.min = anterior && anterior < fechaLocalHoy() && inicio.value === anterior ? anterior : fechaLocalHoy();
  fin.min = inicio.value || "";
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
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const revisarAvisos = async (tipo, mision, objetivo, idFase = "") => {
    for (const extremo of ["inicio", "fin"]) {
      const fecha = objetivo[`fecha_${extremo}`];
      const habilitado = objetivo[`notificar_${extremo}`];
      const yaNotificado = objetivo[`notificado_${extremo}`] === fecha;
      const clave = `${tipo}:${mision.id}:${idFase || "mision"}:${extremo}:${fecha}`;
      const horaPorDefecto = extremo === "inicio" ? "00:00" : "23:59";
      const horaProgramada = objetivo[`hora_aviso_${extremo}`] || horaPorDefecto;
      if (!habilitado || !fecha || fecha !== hoy || horaActual !== horaProgramada || yaNotificado || avisosEmitidosEnSesion.has(clave)) continue;
      avisosEmitidosEnSesion.add(clave);
      try {
        const sufijo = idFase ? ` · ${mision.titulo}` : "";
        await mostrarNotificacion(
          extremo === "inicio" ? "Comienza una misión" : "Misión para hoy",
          `${objetivo.titulo}${sufijo} — ${extremo === "inicio" ? "fecha de inicio" : "fecha de fin"}`,
          clave
        );
        await Almacen.marcarNotificada(tipo, mision.id, extremo, fecha, idFase);
        objetivo[`notificado_${extremo}`] = fecha;
      } catch (error) {
        mostrarAviso(mensajeError(error, "No se pudo mostrar el aviso de fecha."), "error");
      }
    }
  };

  for (const tipo of ORDEN) {
    for (const mision of estado.misiones[tipo] || []) {
      if (!misionVisible(tipo, mision)) continue;
      await revisarAvisos(tipo, mision, mision);
      for (const fase of mision.fases || []) {
        if (!fase.completada && faseEsActiva(mision, fase)) {
          await revisarAvisos(tipo, mision, fase, fase.id);
        }
      }
      if (mision.regular && mision.notificar_regular && mision.hora_regular
          && (mision.dias_regular || []).includes(ahora.getDay())
          && mision.notificado_regular_el !== hoy && mision.hora_regular === horaActual) {
        const clave = `${tipo}:${mision.id}:regular:${hoy}`;
        if (!avisosEmitidosEnSesion.has(clave)) {
          avisosEmitidosEnSesion.add(clave);
          try {
            await mostrarNotificacion("Misión regular disponible", mision.titulo, clave);
            await Almacen.marcarNotificada(tipo, mision.id, "regular", hoy);
            mision.notificado_regular_el = hoy;
          } catch (error) {
            mostrarAviso(mensajeError(error, "No se pudo mostrar el aviso de recurrencia."), "error");
          }
        }
      }
    }
  }
}

let ultimoDiaVisto = fechaLocalHoy();
setInterval(() => {
  const hoy = fechaLocalHoy();
  if (hoy !== ultimoDiaVisto) {
    ultimoDiaVisto = hoy;
    render();
  }
  comprobarAvisosFecha();
}, 10 * 1000);
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

/* ---------- Historial de completadas ---------- */
function renderHistorial() {
  const texto = $("#historial-busqueda").value.trim().toLocaleLowerCase("es");
  const tipo = $("#historial-tipo").value;
  const desde = $("#historial-desde").value;
  const hasta = $("#historial-hasta").value;
  const resultados = [...estado.historial]
    .filter((registro) => !texto || String(registro.titulo || "").toLocaleLowerCase("es").includes(texto))
    .filter((registro) => !tipo || registro.tipo === tipo)
    .filter((registro) => {
      const dia = String(registro.fecha_completada || "").slice(0, 10);
      return (!desde || dia >= desde) && (!hasta || dia <= hasta);
    })
    .sort((a, b) => String(b.fecha_completada || "").localeCompare(String(a.fecha_completada || "")));

  const lista = $("#lista-historial");
  lista.innerHTML = "";
  resultados.forEach((registro) => {
    const fila = document.createElement("li");
    fila.className = "historial-item";
    const cuerpo = document.createElement("div");
    cuerpo.className = "historial-item-cuerpo";
    const titulo = document.createElement("strong");
    titulo.textContent = registro.titulo || "Misión sin título";
    const descripcion = document.createElement("p");
    descripcion.textContent = registro.descripcion || "";
    const meta = document.createElement("small");
    const tipoNombre = TIPOS[registro.tipo]?.nombre || "Tipo anterior no registrado";
    const fecha = registro.fecha_completada ? new Date(registro.fecha_completada).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "Fecha desconocida";
    meta.textContent = `${tipoNombre} · ${fecha}`;
    cuerpo.append(titulo, descripcion, meta);
    fila.appendChild(cuerpo);
    lista.appendChild(fila);
  });
  $("#historial-resumen").textContent = `${resultados.length} misión(es) completada(s)`;
  $("#historial-vacio").hidden = resultados.length > 0;
}

function abrirHistorial() {
  renderHistorial();
  $("#dialogo-historial").showModal();
  $("#historial-busqueda").focus();
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
$("#btn-historial").addEventListener("click", abrirHistorial);
$("#btn-cerrar-historial").addEventListener("click", () => $("#dialogo-historial").close());
$("#historial-busqueda").addEventListener("input", renderHistorial);
$("#historial-tipo").addEventListener("change", renderHistorial);
$("#historial-desde").addEventListener("change", renderHistorial);
$("#historial-hasta").addEventListener("change", renderHistorial);
$("#btn-cancelar-mision").addEventListener("click", cancelarMisionActual);
$("#campo-inicio").addEventListener("change", actualizarDisponibilidadAvisos);
$("#campo-fin").addEventListener("change", actualizarDisponibilidadAvisos);
$("#aviso-inicio").addEventListener("change", activarAvisoFecha);
$("#aviso-fin").addEventListener("change", activarAvisoFecha);
$("#aviso-inicio").addEventListener("change", actualizarDisponibilidadAvisos);
$("#aviso-fin").addEventListener("change", actualizarDisponibilidadAvisos);
$("#campo-regular").addEventListener("change", actualizarControlesRegular);
$("#campo-hora-regular").addEventListener("change", () => {
  const activar = Boolean($("#campo-hora-regular").value) && !$("#campo-aviso-regular").checked;
  if (activar) $("#campo-aviso-regular").checked = true;
  actualizarControlesRegular();
  if (activar) activarAvisoFecha({ currentTarget: $("#campo-aviso-regular") });
});
$("#campo-aviso-regular").addEventListener("change", activarAvisoFecha);
$("#btn-anadir-fase").addEventListener("click", abrirEditorFases);
$("#btn-cerrar-editor-fases").addEventListener("click", cancelarEditorFases);
$("#btn-cancelar-editor-fases").addEventListener("click", cancelarEditorFases);
$("#btn-confirmar-fases").addEventListener("click", confirmarEditorFases);
$("#btn-crear-fase").addEventListener("click", () => {
  modoEditorFases = "add";
  faseConectadaDesde = "";
  $("#editor-error").hidden = true;
  actualizarModoEditor();
});
$("#btn-conectar-fases").addEventListener("click", () => {
  modoEditorFases = modoEditorFases === "connect" ? "idle" : "connect";
  faseConectadaDesde = "";
  actualizarModoEditor();
  renderEditorFases();
});
$("#btn-borrar-flecha").addEventListener("click", () => {
  modoEditorFases = modoEditorFases === "deleteEdge" ? "idle" : "deleteEdge";
  faseConectadaDesde = "";
  actualizarModoEditor();
  renderEditorFases();
});
$("#lienzo-fases").addEventListener("click", crearFaseEnLienzo);
document.addEventListener("pointerup", completarConexion);
$("#form-ajuste-fase").addEventListener("submit", guardarAjustesFase);
$("#btn-cerrar-ajuste-fase").addEventListener("click", () => $("#dialogo-ajuste-fase").close());
$("#btn-cancelar-ajuste-fase").addEventListener("click", () => $("#dialogo-ajuste-fase").close());
$("#btn-eliminar-fase").addEventListener("click", eliminarFaseEnEdicion);
$("#ajuste-fase-inicio").addEventListener("change", () => {
  actualizarFechasAjusteFase();
  actualizarControlesAvisoAjusteFase();
});
$("#ajuste-fase-fin").addEventListener("change", actualizarControlesAvisoAjusteFase);
$("#ajuste-fase-aviso-inicio").addEventListener("change", activarAvisoFecha);
$("#ajuste-fase-aviso-fin").addEventListener("change", activarAvisoFecha);
$("#ajuste-fase-aviso-inicio").addEventListener("change", actualizarControlesAvisoAjusteFase);
$("#ajuste-fase-aviso-fin").addEventListener("change", actualizarControlesAvisoAjusteFase);
$("#form-grado").addEventListener("submit", guardarGrado);
$("#btn-cerrar-grado").addEventListener("click", () => $("#dialogo-grado").close());
$("#btn-cancelar-grado").addEventListener("click", () => $("#dialogo-grado").close());

$("#dialogo").addEventListener("click", (evento) => {
  if (evento.target === $("#dialogo")) cerrarDialogo();
});
$("#dialogo-historial").addEventListener("click", (evento) => {
  if (evento.target === $("#dialogo-historial")) $("#dialogo-historial").close();
});

configurarInstalacion();
configurarCopia();
cargar();
