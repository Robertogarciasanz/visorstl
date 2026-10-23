# visorstl

Visor y simulador de archivos 3D (Elegoo Centuri Carbon), publicado en [cenital.org](https://cenital.org).

## Qué contiene

- **Visor 3D** en la raíz del sitio (`index.html`, código en `src/`). Hecho con React, Vite y three.js.
- **Página de herramientas** en [cenital.org/herramientas/](https://cenital.org/herramientas/), con el listado de herramientas disponibles para Claude. Su fuente está en `public/herramientas/index.html`.
- **Documentación DNS** de cenital.org en `docs/dns-cenital.org.txt`.

## Desarrollo

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev       # servidor de desarrollo en http://localhost:3000
npm run build     # genera dist/
npm run preview   # sirve dist/ para comprobarlo
npm run lint      # comprobación de tipos con tsc
```

Si necesitas variables de entorno, copia `.env.example` a `.env.local` y rellénalas. No subas `.env.local` al repositorio.

## Publicación

- Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que compila el proyecto y lo despliega en GitHub Pages.
- Lo que hay en `public/` se copia tal cual a la raíz de `dist/`. Por eso `public/herramientas/index.html` queda accesible en `/herramientas/`.
- El dominio personalizado está en `public/CNAME`. No lo borres ni lo cambies sin revisar la configuración DNS.

## Añadir una página estática

1. Crea la carpeta en `public/`, por ejemplo `public/mi-pagina/`.
2. Coloca dentro un `index.html` (así la URL es `/mi-pagina/`).
3. Haz commit y push a `main`. El despliegue tarda unos minutos.

Las páginas de `public/` se publican tal cual, sin pasar por el compilador. Cualquiera con el enlace puede verlas.
