/**
 * WebSocket Server
 *
 * Canal bidireccional entre la web app y el servidor MCP.
 * Eventos:
 * - element-selected: usuario selecciona elemento en web app
 * - file-changed: archivo HTML/CSS modificado
 * - highlight-element: MCP pide resaltar elemento
 * - css-applied: CSS aplicado correctamente
 */

import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import { applyCssChange } from './css-editor.js';

// Estado global del WebSocket
let wss: WebSocketServer | null = null;
let connectedClients: Set<WebSocket> = new Set();

// Almacena el último elemento seleccionado
let selectedElement: SelectedElement | null = null;

// Almacena el último HTML cargado para enviarlo a nuevos clientes
let currentHtml: { filePath: string; content: string } | null = null;

export interface SelectedElement {
  selector: string;
  tag: string;
  line: number;
  styles: Record<string, string>;
}

// Cola de promesas para esperar selección de elementos
let selectionResolvers: ((element: SelectedElement) => void)[] = [];

/**
 * Inicia el servidor WebSocket con puerto dinámico (port 0 = OS asigna libre).
 * Retorna el puerto real asignado.
 */
export function startWebSocketServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({ port: 0 });

    wss.on('listening', () => {
      const addr = wss!.address() as import('node:net').AddressInfo;
      resolve(addr.port);
    });

    wss.on('connection', (ws) => {
      connectedClients.add(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          handleMessage(message, ws);
        } catch (error) {
          console.error('Error parseando mensaje WS:', error);
        }
      });

      ws.on('close', () => {
        connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        connectedClients.delete(ws);
      });
    });

    wss.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Maneja mensajes entrantes desde la web app
 */
function handleMessage(message: { type: string; payload?: unknown }, ws: WebSocket): void {
  switch (message.type) {
    case 'element-selected':
      selectedElement = message.payload as SelectedElement;
      // Resolver promesas pendientes
      selectionResolvers.forEach(resolve => resolve(selectedElement!));
      selectionResolvers = [];
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    case 'ready':
      // Web app lista - enviar HTML actual si existe
      if (currentHtml) {
        ws.send(JSON.stringify({
          type: 'load-html',
          payload: currentHtml
        }));
      }
      break;

    case 'load-html':
      // Cliente externo carga HTML - guardar y reenviar a otros clientes
      const htmlPayload = message.payload as { filePath: string; content: string };
      if (htmlPayload) {
        currentHtml = htmlPayload;
        // Broadcast a todos los clientes (incluyendo web apps)
        broadcast('load-html', htmlPayload);
      }
      break;

    case 'apply-css':
      // Aplicar cambio de CSS al archivo
      const cssPayload = message.payload as { selector: string; property: string; value: string };
      if (cssPayload && currentHtml) {
        const result = applyCssChange(currentHtml.filePath, cssPayload);
        if (result.success) {
          // Leer el archivo actualizado y enviarlo a todos
          const updatedContent = fs.readFileSync(currentHtml.filePath, 'utf8');
          currentHtml = { filePath: currentHtml.filePath, content: updatedContent };
          broadcast('load-html', currentHtml);
          broadcast('css-applied', { selector: cssPayload.selector, property: cssPayload.property, value: cssPayload.value });
        }
      }
      break;

    default:
      console.error('Mensaje WS desconocido:', message.type);
  }
}

/**
 * Envía mensaje a todos los clientes conectados
 */
export function broadcast(type: string, payload?: unknown): void {
  const message = JSON.stringify({ type, payload });
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Envía archivo HTML para mostrar en el preview
 */
export function sendFileContent(filePath: string, content: string): void {
  // Guardar para nuevos clientes
  currentHtml = { filePath, content };
  broadcast('load-html', { filePath, content });
}

/**
 * Notifica que un archivo ha cambiado (hot reload)
 */
export function notifyFileChanged(filePath: string, content: string): void {
  broadcast('file-changed', { filePath, content });
}

/**
 * Resalta un elemento en la web app
 */
export function highlightElement(selector: string): void {
  broadcast('highlight-element', { selector });
}

/**
 * Notifica que se aplicó CSS
 */
export function notifyCssApplied(selector: string, property: string, value: string): void {
  broadcast('css-applied', { selector, property, value });
}

/**
 * Obtiene el elemento actualmente seleccionado
 */
export function getSelectedElement(): SelectedElement | null {
  return selectedElement;
}

/**
 * Espera a que el usuario seleccione un elemento
 * Retorna una promesa que se resuelve cuando hay selección
 */
export function waitForSelection(timeoutMs: number = 30000): Promise<SelectedElement> {
  return new Promise((resolve, reject) => {
    // Si ya hay un elemento seleccionado, retornarlo
    if (selectedElement) {
      resolve(selectedElement);
      return;
    }

    // Agregar resolver a la cola
    selectionResolvers.push(resolve);

    // Timeout
    setTimeout(() => {
      const index = selectionResolvers.indexOf(resolve);
      if (index > -1) {
        selectionResolvers.splice(index, 1);
        reject(new Error('Timeout esperando selección de elemento'));
      }
    }, timeoutMs);
  });
}

/**
 * Verifica si hay clientes conectados
 */
export function hasConnectedClients(): boolean {
  return connectedClients.size > 0;
}

/**
 * Obtiene el servidor WebSocket
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

/**
 * Cierra el servidor WebSocket
 */
export function closeWebSocketServer(): void {
  if (wss) {
    connectedClients.forEach(client => client.close());
    connectedClients.clear();
    wss.close();
    wss = null;
  }
}
