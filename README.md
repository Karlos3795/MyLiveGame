# MyLiveGame (beta)

Convierte tus tareas en misiones. El proyecto está en fase beta y ofrece una
aplicación instalable y una versión web con servidor propio.

## Acceder y descargar

- **Abrir / instalar la aplicación:** [MyLiveGame (PWA)](https://karlos3795.github.io/MyLiveGame/)
- **Instalar en móvil:** abre el enlace anterior en el navegador y elige **Añadir a pantalla de inicio** o **Instalar app**. No hace falta descargar un APK.
- **Actualizar una instalación anterior:** abre la PWA con conexión; comprobará si hay una versión nueva. Si el móvil aún muestra el icono antiguo, exporta primero una copia JSON y vuelve a añadir el acceso directo, pues el sistema puede conservarlo en caché.
- **Versión web:** inicia el servidor local con `python3 web/server.py` y abre [http://127.0.0.1:8000](http://127.0.0.1:8000). [Ver los archivos de la versión web](https://github.com/Karlos3795/MyLiveGame/tree/main/web). Todavía no hay un servicio web remoto publicado.

La aplicación funciona sin conexión después de la primera visita. Los datos se
guardan en el dispositivo y se pueden exportar con **Copia de seguridad**.

## Versiones (beta)

### 2.0 (beta) — actual

- Historial de completadas con búsqueda por título y filtros por fechas y tipo.
- Edición y cancelación de misiones desde sus ajustes.
- Progreso de misiones con fases calculado según el peso de cada fase.
- Misiones diarias que vuelven a activarse y misiones regulares con días de la
  semana seleccionables.
- Horas de aviso configurables para inicio, fin y recordatorios semanales.
- Nombre **MyLiveGame** e icono MLG sobre un fondo de atardecer.

### 1.5 (beta)

- Editor visual de fases con flechas, ramas y uniones.
- Fases con fechas y valor; las dependientes se desbloquean al completar sus
  predecesoras.
- Cambio de categoría de una misión desde sus ajustes.
- Restricciones de fechas y mejoras de los controles de aviso en móvil.
