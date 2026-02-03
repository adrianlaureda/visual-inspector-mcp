/**
 * Utilidades para gestión de puertos
 *
 * Detecta y libera puertos ocupados por procesos zombie.
 */

import { execSync } from 'node:child_process';

/**
 * Obtiene el PID del proceso que está usando un puerto
 * @returns PID o null si el puerto está libre
 */
export function getProcessOnPort(port: number): number | null {
  try {
    // macOS/Linux: lsof para encontrar el proceso
    const output = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' });
    const pid = parseInt(output.trim().split('\n')[0], 10);
    return isNaN(pid) ? null : pid;
  } catch {
    // Si lsof falla o no encuentra nada, el puerto está libre
    return null;
  }
}

/**
 * Verifica si un puerto está en uso
 */
export function isPortInUse(port: number): boolean {
  return getProcessOnPort(port) !== null;
}

/**
 * Intenta liberar un puerto matando el proceso que lo usa
 * @returns true si se liberó (o ya estaba libre), false si falló
 */
export function freePort(port: number): boolean {
  const pid = getProcessOnPort(port);

  if (pid === null) {
    // Puerto ya libre
    return true;
  }

  try {
    // Intentar matar el proceso
    process.kill(pid, 'SIGTERM');

    // Esperar un poco y verificar
    let attempts = 0;
    while (attempts < 10) {
      // Pequeña pausa síncrona
      execSync('sleep 0.1');

      if (!isPortInUse(port)) {
        return true;
      }
      attempts++;
    }

    // Si SIGTERM no funcionó, usar SIGKILL
    process.kill(pid, 'SIGKILL');
    execSync('sleep 0.2');

    return !isPortInUse(port);
  } catch {
    // Error matando el proceso (permisos, ya murió, etc.)
    return !isPortInUse(port);
  }
}

/**
 * Libera un puerto si está ocupado, con logging opcional
 */
export function ensurePortFree(port: number, silent: boolean = false): boolean {
  if (!isPortInUse(port)) {
    return true;
  }

  const pid = getProcessOnPort(port);
  if (!silent) {
    console.error(`Puerto ${port} ocupado por PID ${pid}. Liberando...`);
  }

  const freed = freePort(port);

  if (!silent && freed) {
    console.error(`Puerto ${port} liberado.`);
  } else if (!silent && !freed) {
    console.error(`No se pudo liberar el puerto ${port}.`);
  }

  return freed;
}
