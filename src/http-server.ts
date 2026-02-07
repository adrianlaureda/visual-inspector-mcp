/**
 * HTTP Server
 *
 * Sirve la web app del inspector visual.
 * Rutas:
 * - GET / → web app principal (con WS_PORT inyectado)
 * - GET /health → health check
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: http.Server | null = null;
let injectedWsPort: number = 0;

/**
 * Inicia el servidor HTTP con puerto dinámico (port 0 = OS asigna libre).
 * Inyecta el puerto WS en el HTML servido para que la web app sepa dónde conectar.
 * Retorna el puerto real asignado.
 */
export function startHttpServer(wsPort: number): Promise<number> {
  injectedWsPort = wsPort;

  return new Promise((resolve, reject) => {
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

      const url = new URL(req.url || '/', `http://localhost`);

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

    server.listen(0, () => {
      const addr = server!.address() as import('node:net').AddressInfo;
      resolve(addr.port);
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Sirve la web app inyectando el puerto WS como variable global
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

    // Inyectar puerto WS antes del primer <script> del body
    const wsScript = `<script>window.WS_PORT = ${injectedWsPort};</script>`;
    const modified = content.replace('<head>', `<head>\n  ${wsScript}`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(modified);
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
