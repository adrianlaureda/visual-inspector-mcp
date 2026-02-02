/**
 * CSS Editor
 *
 * Aplica cambios de CSS a archivos HTML o CSS.
 * Detecta si el estilo está inline, en <style>, o en archivo CSS externo.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';

export interface CssChange {
  selector: string;
  property: string;
  value: string;
}

export interface ApplyResult {
  success: boolean;
  message: string;
  modifiedFile?: string;
}

/**
 * Aplica un cambio de CSS al archivo HTML o CSS correspondiente
 */
export function applyCssChange(htmlPath: string, change: CssChange): ApplyResult {
  const absolutePath = path.resolve(htmlPath);

  if (!fs.existsSync(absolutePath)) {
    return { success: false, message: `Archivo no encontrado: ${htmlPath}` };
  }

  const htmlContent = fs.readFileSync(absolutePath, 'utf8');

  // Estrategia 1: Buscar en <style> dentro del HTML
  const styleResult = applyToInlineStyle(htmlContent, change);
  if (styleResult.found) {
    fs.writeFileSync(absolutePath, styleResult.content, 'utf8');
    return {
      success: true,
      message: `CSS aplicado en <style> de ${path.basename(htmlPath)}`,
      modifiedFile: absolutePath
    };
  }

  // Estrategia 2: Buscar archivos CSS externos enlazados
  const linkedCss = findLinkedCssFiles(htmlContent, path.dirname(absolutePath));
  for (const cssFile of linkedCss) {
    const cssResult = applyToCssFile(cssFile, change);
    if (cssResult.found) {
      return {
        success: true,
        message: `CSS aplicado en ${path.basename(cssFile)}`,
        modifiedFile: cssFile
      };
    }
  }

  // Estrategia 3: Añadir nuevo bloque <style> si no existe el selector
  const newContent = addStyleBlock(htmlContent, change);
  fs.writeFileSync(absolutePath, newContent, 'utf8');
  return {
    success: true,
    message: `Nuevo estilo añadido a ${path.basename(htmlPath)}`,
    modifiedFile: absolutePath
  };
}

/**
 * Busca y modifica CSS dentro de un bloque <style>
 */
function applyToInlineStyle(html: string, change: CssChange): { found: boolean; content: string } {
  // Regex para encontrar bloques <style>
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let found = false;

  const newHtml = html.replace(styleRegex, (match, cssContent) => {
    const result = modifyCssContent(cssContent, change);
    if (result.modified) {
      found = true;
      return match.replace(cssContent, result.content);
    }
    return match;
  });

  return { found, content: newHtml };
}

/**
 * Aplica cambio a un archivo CSS externo
 */
function applyToCssFile(cssPath: string, change: CssChange): { found: boolean } {
  if (!fs.existsSync(cssPath)) {
    return { found: false };
  }

  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const result = modifyCssContent(cssContent, change);

  if (result.modified) {
    fs.writeFileSync(cssPath, result.content, 'utf8');
    return { found: true };
  }

  return { found: false };
}

/**
 * Modifica contenido CSS para aplicar un cambio
 */
function modifyCssContent(css: string, change: CssChange): { modified: boolean; content: string } {
  try {
    const ast = csstree.parse(css);
    let modified = false;

    csstree.walk(ast, {
      visit: 'Rule',
      enter(node) {
        // Verificar si el selector coincide
        const selectorText = csstree.generate(node.prelude);
        if (normalizeSelector(selectorText) === normalizeSelector(change.selector)) {
          // Buscar la propiedad existente
          const block = node.block;
          if (block && block.type === 'Block') {
            let propertyFound = false;

            csstree.walk(block, {
              visit: 'Declaration',
              enter(decl) {
                if (decl.property === change.property) {
                  // Actualizar valor existente
                  decl.value = csstree.parse(change.value, { context: 'value' }) as csstree.Value;
                  propertyFound = true;
                  modified = true;
                }
              }
            });

            // Si la propiedad no existe, añadirla
            if (!propertyFound) {
              const newDecl: csstree.Declaration = {
                type: 'Declaration',
                important: false,
                property: change.property,
                value: csstree.parse(change.value, { context: 'value' }) as csstree.Value
              };
              block.children.appendData(newDecl);
              modified = true;
            }
          }
        }
      }
    });

    if (modified) {
      return { modified: true, content: csstree.generate(ast) };
    }
  } catch (error) {
    // Si falla el parsing, intentar regex simple
    return applyWithRegex(css, change);
  }

  return { modified: false, content: css };
}

/**
 * Fallback: aplicar cambio con regex simple
 */
function applyWithRegex(css: string, change: CssChange): { modified: boolean; content: string } {
  // Escapar caracteres especiales en el selector para regex
  const escapedSelector = change.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorRegex = new RegExp(
    `(${escapedSelector}\\s*\\{[^}]*)\\}`,
    'gi'
  );

  let modified = false;
  const newCss = css.replace(selectorRegex, (match, before) => {
    const propertyRegex = new RegExp(`${change.property}\\s*:[^;]+;?`, 'gi');

    if (propertyRegex.test(before)) {
      // Reemplazar propiedad existente
      modified = true;
      return before.replace(propertyRegex, `${change.property}: ${change.value};`) + '}';
    } else {
      // Añadir nueva propiedad
      modified = true;
      return `${before.trimEnd()}\n  ${change.property}: ${change.value};\n}`;
    }
  });

  return { modified, content: newCss };
}

/**
 * Encuentra archivos CSS enlazados en el HTML
 */
function findLinkedCssFiles(html: string, baseDir: string): string[] {
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
  const files: string[] = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    // Solo archivos locales (no URLs externas)
    if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
      files.push(path.resolve(baseDir, href));
    }
  }

  return files;
}

/**
 * Añade un nuevo bloque <style> al HTML
 */
function addStyleBlock(html: string, change: CssChange): string {
  const newStyle = `\n<style>\n${change.selector} {\n  ${change.property}: ${change.value};\n}\n</style>`;

  // Insertar antes de </head> si existe
  if (html.includes('</head>')) {
    return html.replace('</head>', `${newStyle}\n</head>`);
  }

  // Insertar al principio si no hay <head>
  return newStyle + '\n' + html;
}

/**
 * Normaliza un selector CSS para comparación
 */
function normalizeSelector(selector: string): string {
  return selector
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*>\s*/g, ' > ')
    .replace(/\s*,\s*/g, ', ');
}

/**
 * Lee los estilos actuales de un selector en un archivo
 */
export function getStylesForSelector(htmlPath: string, selector: string): Record<string, string> {
  const styles: Record<string, string> = {};

  if (!fs.existsSync(htmlPath)) {
    return styles;
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Buscar en <style>
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;

  while ((match = styleRegex.exec(htmlContent)) !== null) {
    const cssContent = match[1];
    Object.assign(styles, extractStylesFromCss(cssContent, selector));
  }

  // Buscar en CSS externos
  const linkedCss = findLinkedCssFiles(htmlContent, path.dirname(htmlPath));
  for (const cssFile of linkedCss) {
    if (fs.existsSync(cssFile)) {
      const cssContent = fs.readFileSync(cssFile, 'utf8');
      Object.assign(styles, extractStylesFromCss(cssContent, selector));
    }
  }

  return styles;
}

/**
 * Extrae estilos de un selector en contenido CSS
 */
function extractStylesFromCss(css: string, targetSelector: string): Record<string, string> {
  const styles: Record<string, string> = {};

  try {
    const ast = csstree.parse(css);

    csstree.walk(ast, {
      visit: 'Rule',
      enter(node) {
        const selectorText = csstree.generate(node.prelude);
        if (normalizeSelector(selectorText) === normalizeSelector(targetSelector)) {
          const block = node.block;
          if (block && block.type === 'Block') {
            csstree.walk(block, {
              visit: 'Declaration',
              enter(decl) {
                styles[decl.property] = csstree.generate(decl.value);
              }
            });
          }
        }
      }
    });
  } catch (error) {
    // Ignorar errores de parsing
  }

  return styles;
}
