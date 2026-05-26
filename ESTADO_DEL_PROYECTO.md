# Estado del Proyecto: VisionControl

Este documento resume el progreso actual del proyecto, los componentes principales y los comandos necesarios para ejecutarlo.

## 🚀 Comandos para correr el proyecto

El proyecto está configurado como un monorepo (usando npm workspaces). Puedes iniciar los distintos servicios desde la raíz del proyecto (`d:\Descargas\VisionControl`) utilizando los siguientes comandos:

- **Servidor (Backend)**:
  ```bash
  npm run dev:server
  ```
  *(Ejecuta el workspace de la carpeta `server`)*

- **Agente**:
  ```bash
  npm run dev:agent
  ```
  *(Ejecuta el workspace de la carpeta `agent`)*

- **Frontend**:
  ```bash
  npm run dev:frontend
  ```
  *(Ejecuta el workspace de la carpeta `frontend`)*

Si deseas ejecutar todo al mismo tiempo, puedes abrir 3 terminales y ejecutar uno de los comandos en cada una.

*(Nota: La carpeta `dashboard` parece ser un proyecto independiente con Vite, ya que no está listada en los workspaces del `package.json`. Si necesitas correrla, debes entrar a esa carpeta con `cd dashboard` y ejecutar `npm run dev`)*.

---

## 🏗️ Lo que tenemos avanzado (Estructura actual)

Actualmente, el proyecto está dividido en varios módulos/carpetas principales:

1. **`server/`**: El servidor backend principal. Maneja la API y la lógica central.
2. **`agent/`**: Un servicio que interactúa o procesa tareas específicas como agente independiente.
3. **`frontend/`**: La interfaz de usuario principal del sistema.
4. **`shared/`**: Código compartido entre los distintos módulos (por ejemplo utilidades o tipos en común).
5. **`dashboard/`**: Una interfaz de panel de control construida con Vite.

## 🚧 Lo que falta / Próximos pasos

*(Esta sección la iremos actualizando según nuestras tareas)*

- [ ] **Conexión de los servicios**: Asegurar que el frontend, el agente y el servidor se comuniquen correctamente entre sí.
- [ ] **Consolidar el Dashboard**: Decidir si el dashboard se integrará al monorepo (agregándolo a los workspaces del `package.json`) o si seguirá separado.
- [ ] **Funcionalidades de Negocio**: Implementar la lógica faltante según los requerimientos específicos que vayamos agregando.
- [ ] **Testing**: Pruebas para garantizar que el sistema es estable.
- [ ] **Preparación para Producción**: Scripts y configuraciones para subir el proyecto a un entorno real.
602