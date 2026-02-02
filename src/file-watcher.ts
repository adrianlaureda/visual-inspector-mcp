/**
 * File Watcher
 *
 * Monitorea cambios en archivos HTML/CSS para hot reload.
 * Usa chokidar para watch eficiente.
 */

import chokidar, { FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import { notifyFileChanged } from './websocket.js';

// Watchers activos por archivo
const watchers: Map<string, FSWatcher> = new Map();

// Debounce para evitar múltiples notificaciones
const debounceTimers: Map<string, NodeJS.Timeout> = new Map();
const DEBOUNCE_MS = 100;

/**
 * Inicia el watch de un archivo HTML y sus CSS relacionados
 */
export function watchFile(filePath: string): void {
  const absolutePath = path.resolve(filePath);

  // Si ya hay un watcher activo, no duplicar
  if (watchers.has(absolutePath)) {
    return;
  }

  // Archivos a monitorear: el HTML y cualquier CSS en el mismo directorio
  const dir = path.dirname(absolutePath);
  const patterns = [
    absolutePath,
    path.join(dir, '*.css')
  ];

  const watcher = chokidar.watch(patterns, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  watcher.on('change', (changedPath) => {
    handleFileChange(changedPath, absolutePath);
  });

  watcher.on('error', (error) => {
    console.error(`Error watching ${absolutePath}:`, error);
  });

  watchers.set(absolutePath, watcher);
}

/**
 * Maneja un cambio de archivo con debounce
 */
function handleFileChange(changedPath: string, mainHtmlPath: string): void {
  // Cancelar timer anterior si existe
  const existingTimer = debounceTimers.get(changedPath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Nuevo timer con debounce
  const timer = setTimeout(() => {
    debounceTimers.delete(changedPath);

    // Leer contenido actualizado
    try {
      // Si cambió el HTML, enviar el HTML
      // Si cambió un CSS, enviar el HTML (para que recargue los estilos)
      const content = fs.readFileSync(mainHtmlPath, 'utf8');
      notifyFileChanged(mainHtmlPath, content);
    } catch (error) {
      console.error(`Error leyendo ${changedPath}:`, error);
    }
  }, DEBOUNCE_MS);

  debounceTimers.set(changedPath, timer);
}

/**
 * Detiene el watch de un archivo
 */
export function unwatchFile(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  const watcher = watchers.get(absolutePath);

  if (watcher) {
    watcher.close();
    watchers.delete(absolutePath);
  }
}

/**
 * Detiene todos los watchers activos
 */
export function unwatchAll(): void {
  for (const [filePath, watcher] of watchers) {
    watcher.close();
  }
  watchers.clear();

  // Limpiar timers pendientes
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}

/**
 * Obtiene la lista de archivos monitoreados
 */
export function getWatchedFiles(): string[] {
  return Array.from(watchers.keys());
}
