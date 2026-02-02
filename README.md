# Visual Inspector MCP

Servidor MCP para inspeccionar y editar HTML visualmente desde Claude Code, con comunicación bidireccional.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code                                                │
│  - Usa herramientas: inspect_html, get_selected_element...  │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (stdio)
┌──────────────────────▼──────────────────────────────────────┐
│  visual-inspector-mcp (Node.js)                             │
│  - Servidor MCP (stdio)                                     │
│  - Servidor HTTP (puerto 8080)                              │
│  - Servidor WebSocket (puerto 7777)                         │
│  - File watcher para hot reload                             │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│  Web App (Chrome en modo app)                               │
│  - Preview del HTML en iframe                               │
│  - Panel inspector con propiedades CSS                      │
│  - Click en elemento → enviado a Claude Code                │
└─────────────────────────────────────────────────────────────┘
```

## Herramientas MCP

| Herramienta | Descripción |
|-------------|-------------|
| `inspect_html` | Abre el visualizador para un archivo HTML |
| `get_selected_element` | Obtiene el elemento seleccionado (selector, tag, estilos) |
| `highlight_element` | Resalta un elemento por selector CSS |
| `apply_css_change` | Aplica cambios CSS al archivo |
| `close_inspector` | Cierra el visualizador |

### Ejemplos de uso

```
Usuario: "abre el inspector para mi presentación"
Claude: [usa inspect_html con file_path="presentacion.html"]

Usuario: "¿qué elemento tengo seleccionado?"
Claude: [usa get_selected_element]
→ Devuelve: { selector: "h1.titulo", tag: "h1", styles: {...} }

Usuario: "cambia el color a rojo"
Claude: [usa apply_css_change con selector="h1.titulo", property="color", value="red"]
```

## Instalación

### 1. Compilar el proyecto

```bash
cd ~/Proyectos/Claude/visual-inspector-mcp
npm install
npm run build
```

### 2. Configurar MCP

El MCP ya está configurado en:
- `~/.mcp.json` - Definición del servidor
- `~/.claude/settings.json` - Habilitado en `enabledMcpjsonServers`

### 3. Reiniciar Claude Code

```bash
# Cerrar Claude Code actual y abrir de nuevo
claude
```

## Uso

### Desde Claude Code

```
> abre sample.html en el inspector visual

[Claude usa inspect_html]
→ Se abre ventana de Chrome en modo app
→ Muestra el HTML con panel de inspector

> [seleccionas un elemento en la ventana]
> ¿qué tengo seleccionado?

[Claude usa get_selected_element]
→ "Tienes seleccionado el h1 con selector 'div.card > h1'"

> cambia el fondo a azul

[Claude usa apply_css_change]
→ El archivo se modifica y el preview se actualiza
```

### Características de la Web App

- **Tema oscuro** por defecto (toggle en la esquina)
- **Viewports**: mobile / tablet / desktop
- **Inspector**: colores, dimensiones, tipografía, layout
- **Color picker**: click en el cuadro de color para abrir selector nativo
- **Hot reload**: cambios externos se reflejan automáticamente
- **Indicador de conexión**: punto verde = conectado

## Estructura del proyecto

```
visual-inspector-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Entry point
│   ├── mcp-server.ts      # Herramientas MCP
│   ├── http-server.ts     # Servidor web (8080)
│   ├── websocket.ts       # Comunicación bidireccional (7777)
│   ├── file-watcher.ts    # Hot reload
│   └── css-editor.ts      # Edición de archivos CSS
├── web/
│   └── index.html         # Web app autocontenida
├── test/
│   └── sample.html        # HTML de prueba
└── dist/                  # Código compilado
```

## Puertos utilizados

| Puerto | Uso |
|--------|-----|
| 8080 | Servidor HTTP (web app) |
| 7777 | WebSocket (comunicación bidireccional) |

## Limitaciones conocidas

- **Gradientes**: Cambiar `background-color` no sobreescribe `linear-gradient`. Usar `background` directamente.
- **Body/HTML**: La selección del body puede ser difícil si tiene elementos hijos que cubren todo.
- **CSS externo**: Solo modifica CSS en `<style>` o archivos `.css` locales enlazados.

## Desarrollo

```bash
# Compilar en modo watch
npm run dev

# Ejecutar manualmente (para pruebas)
node dist/index.js
```

## Tecnologías

- Node.js + TypeScript
- @modelcontextprotocol/sdk
- ws (WebSocket)
- chokidar (file watcher)
- css-tree (parsing CSS)
