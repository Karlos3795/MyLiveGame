/* Adaptador de datos para la versión WEB.
 * Habla con el servidor Python (server.py) y su API /api/*.
 */

"use strict";

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opciones,
  });
  let datos = {};
  try {
    datos = await respuesta.json();
  } catch (_) {
    /* respuesta sin cuerpo JSON */
  }
  if (!respuesta.ok) {
    throw new Error(datos.error || "No se pudo completar la operación.");
  }
  return datos;
}

window.Almacen = {
  modo: "web",

  cargar() {
    return pedir("/api/misiones");
  },

  crear(datos) {
    return pedir("/api/misiones", {
      method: "POST",
      body: JSON.stringify(datos),
    });
  },

  completar(tipo, id) {
    return pedir("/api/misiones/completar", {
      method: "POST",
      body: JSON.stringify({ tipo, id }),
    });
  },

  marcarNotificada(tipo, id, extremo, fecha) {
    return pedir("/api/misiones/notificada", {
      method: "POST",
      body: JSON.stringify({ tipo, id, extremo, fecha }),
    });
  },

  async descargarCSV() {
    const enlace = document.createElement("a");
    enlace.href = "/api/csv";
    enlace.download = "misiones_completadas.csv";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  },
};
