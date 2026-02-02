#!/usr/bin/env node
/**
 * Visual Inspector MCP - Entry Point
 *
 * Servidor MCP que permite inspeccionar HTML visualmente desde Claude Code.
 * Combina: MCP (stdio) + HTTP (8080) + WebSocket (7777)
 */

import { startMcpServer } from './mcp-server.js';
import { startHttpServer } from './http-server.js';
import { startWebSocketServer, getWebSocketServer } from './websocket.js';

// Puertos por defecto
const HTTP_PORT = 8080;
const WS_PORT = 7777;

async function main() {
  try {
    // Iniciar servidor WebSocket primero (necesario para comunicación)
    startWebSocketServer(WS_PORT);

    // Iniciar servidor HTTP para la web app
    startHttpServer(HTTP_PORT);

    // Iniciar servidor MCP (stdio) - este bloquea
    await startMcpServer();

  } catch (error) {
    console.error('Error iniciando Visual Inspector MCP:', error);
    process.exit(1);
  }
}

main();
