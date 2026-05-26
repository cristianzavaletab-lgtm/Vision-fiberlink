# Implementación del Control Remoto

Para que puedas manipular la laptop remota desde tu teléfono u otra PC, el flujo de datos debe ser el siguiente:

## 1. Flujo de Eventos
1. **Frontend (Tu teléfono):** Captura eventos de clic o movimiento en el área de la pantalla remota.
2. **Servidor (Puente):** Recibe el evento via WebSockets (Socket.io) y lo reenvía al agente específico.
3. **Agente (Laptop remota):** Recibe el comando y usa `robotjs` para ejecutarlo físicamente.

## 2. Ejemplo de comandos (JSON)
El servidor debe enviar mensajes como este al agente:
```json
{
  "type": "MOUSE_MOVE",
  "x": 500,
  "y": 300
}
```

## 3. Librerías Clave
- **Backend/Frontend:** `socket.io` para comunicación en tiempo real sin latencia.
- **Agente:** `robotjs` para manipular el hardware (mouse/teclado).

## 4. Consideraciones de Teléfono
Para que funcione bien en el móvil, el frontend debe convertir los "Touch Events" (toques de pantalla) en coordenadas de mouse `(x, y)` antes de enviarlas al servidor.

---
*Nota: Asegúrate de que el firewall de Windows permita conexiones en los puertos 3000 (API) y 5173 (Frontend).*