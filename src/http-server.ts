/**
 * HTTP Server
 *
 * Sirve la web app del inspector visual.
 * Rutas:
 * - GET / → web app principal
 * - GET /health → health check
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: http.Server | null = null;

/**
 * Inicia el servidor HTTP
 */
export function startHttpServer(port: number): void {
  server = http.createServer((req, res) => {
    // CORS headers para desarrollo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`);

    switch (url.pathname) {
      case '/':
      case '/index.html':
        serveWebApp(res);
        break;

      case '/health':
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        break;

      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
  });

  server.listen(port, () => {
    // Servidor HTTP listo (no logueamos para no interferir con stdio MCP)
  });

  server.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Puerto ${port} en uso.`);
    }
  });
}

/**
 * Sirve la web app desde el archivo HTML
 */
function serveWebApp(res: http.ServerResponse): void {
  // Buscar el archivo HTML en la carpeta web (dentro de dist o fuera)
  let webAppPath = path.resolve(__dirname, 'web/index.html');
  if (!fs.existsSync(webAppPath)) {
    webAppPath = path.resolve(__dirname, '../web/index.html');
  }

  fs.readFile(webAppPath, 'utf8', (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error cargando web app: ' + err.message);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
}

/**
 * Cierra el servidor HTTP
 */
export function closeHttpServer(): void {
  if (server) {
    server.close();
    server = null;
  }
}

/**
 * Obtiene el servidor HTTP
 */
export function getHttpServer(): http.Server | null {
  return server;
}
