# Documentación Técnica - VisionControl

## 1. Descripción General
VisionControl (FiberlinkDesk) es una plataforma de monitoreo y control remoto. El sistema permite gestionar sedes físicas y supervisar/controlar equipos (laptops/PCs) de forma remota mediante una interfaz web.

## 2. Arquitectura del Sistema
El proyecto es un **Monorepo** gestionado con **npm workspaces**.

### Estructura de Directorios

| Carpeta | Componente | Descripción |
| :--- | :--- | :--- |
| `server/` | **Backend** | API central en Node.js/Express. Gestiona la lógica y la comunicación entre agentes y frontend. |
| `agent/` | **Agente Cliente** | Servicio que corre en las laptops a monitorear. Captura pantalla y ejecuta comandos remotos. |
| `frontend/` | **Web Admin** | App principal en React + Tailwind CSS para la administración de sedes y equipos. |
| `shared/` | **Código Compartido**| Tipos de TypeScript e interfaces comunes para todos los módulos. |
| `dashboard/`| **Panel Visual** | Interfaz secundaria de visualización de datos en tiempo real (Vite). |
| `docs/` | **Documentación** | Manuales y guías técnicas del proyecto. |

---

## 3. Detalle de los Módulos

### A. Agente (`/agent`)
Es el software "invitado" en las máquinas cliente.
- **Tecnología:** TypeScript + Node.js.
- **Instalación:** Usa el script `instalar.bat` para automatizar la configuración inicial en Windows.
- **Funciones:** Captura de pantalla, control de mouse/teclado (vía `robotjs`) y telemetría.

### B. Frontend (`/frontend`)
Panel de control para el administrador.
- **Stack:** React, Tailwind CSS, Lucide React.
- **Vistas principales:**
  - `SedesView.tsx`: Gestión de ubicaciones geográficas y asignación de equipos mediante modales.

### C. Servidor (`/server`)
El orquestador central.
- **Tecnología:** Node.js + Express.
- **Responsabilidad:** Base de datos, autenticación y túnel de comandos de control remoto.

---

## 4. Flujo de Operación
1. **Registro:** El agente se instala y busca al servidor mediante la IP en su `config.json`.
2. **Reporte:** El agente envía capturas y estado cada X segundos.
3. **Organización:** El admin usa el `frontend` para asignar equipos a sedes específicas.
4. **Acción:** Los comandos de control viajan del Frontend -> Server -> Agente.

---

## 5. Guía de Ejecución

Desde la raíz del proyecto, primero instala todo:
```bash
npm install
```

### Comandos de Desarrollo (Workspaces)

```bash
# Levantar servidor
npm run dev:server

# Levantar frontend principal
npm run dev:frontend

# Levantar agente (para pruebas)
npm run dev:agent
```

---

## 6. Stack Tecnológico
- **Lenguaje:** TypeScript (Estricto).
- **UI:** React 18+.
- **Estilos:** Tailwind CSS.
- **Iconos:** Lucide React.
- **Bundler:** Vite.

---

## 7. Roadmap / Pendientes
- [ ] Conectar streaming de pantalla mediante WebSockets.
- [ ] Integrar el proyecto `dashboard` a los workspaces del root.
- [ ] Implementar base de datos para persistencia de equipos.

---
*Documento generado para el equipo de desarrollo de VisionControl.*