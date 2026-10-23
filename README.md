# OpenParquetWEB

Visor público de archivos Parquet que procesa los datos en el navegador. Basado en las funciones y la interfaz de OpenParquetPY, en un proyecto independiente. No necesita Python, backend, cuenta de usuario ni base de datos externa.

## Desarrollo

Requiere Node.js 22.12 o superior y npm.

```sh
npm ci
npm run dev
```

Abrí la dirección que muestra Vite. Para probar el resultado de producción:

```sh
npm run build
npm run preview
```

No abras `index.html` con doble clic: los módulos y Web Workers requieren HTTP o HTTPS.

## Publicar en Netlify

1. Subí este repositorio a GitHub, GitLab o Bitbucket.
2. En Netlify elegí **Add new project → Import an existing project** y seleccioná el repositorio.
3. Netlify detecta `netlify.toml`: comando `npm run build`, carpeta publicada `dist`, Node.js 22.
4. Publicá. No requiere variables de entorno ni Functions.

También podés ejecutar `npm ci` y `npm run build` localmente y arrastrar **la carpeta `dist`** a Netlify Drop. Para aplicar también los encabezados de seguridad en despliegues manuales, el build genera `dist/_headers` a partir de `netlify.toml`.

No publiques la raíz del repositorio: la salida lista para hosting es `dist/`. El lockfile fija las versiones instaladas. Los binarios WASM y Workers se copian desde la dependencia instalada y se sirven desde el propio sitio, sin CDN externo en ejecución.

El primer build descarga la extensión Parquet desde `extensions.duckdb.org`, en las variantes MVP y EH que corresponden al motor instalado. El build necesita acceso a Internet; las siguientes ejecuciones reutilizan esos archivos en `public/duckdb/`. DuckDB verifica la firma de la extensión al cargarla.

## Funciones

- Selección de uno o varios archivos locales y arrastrar/soltar.
- Selector entre archivos abiertos y cierre para liberar sus referencias.
- Tabla paginada de 50, 100 o 250 filas, con orden ascendente/descendente.
- Búsqueda literal en todas las columnas.
- Esquema con nombres, tipos y nulabilidad informada por DuckDB.
- Cantidad de filas, columnas, tamaño y grupos de filas.
- Celdas completas en un diálogo accesible con clic o Enter.
- Valores formateados por DuckDB para conservar enteros grandes, decimales y fechas; estructuras anidadas se muestran como texto de DuckDB.

## Privacidad y límites

Los archivos seleccionados se registran con la API FileReader de DuckDB-Wasm. No se envían al hosting, no se almacenan en localStorage ni se agregan al repositorio. Al recargar se pierde la selección; los archivos originales no se modifican. No hay analítica ni peticiones de datos a terceros.

El navegador pide una selección explícita; una web no puede abrir una ruta arbitraria de Windows. No se promete compatibilidad con todos los Parquets: se admiten los formatos y codecs soportados por la versión de DuckDB-Wasm instalada. Archivos cifrados, dañados o con extensiones externas no están admitidos.

Las consultas se ejecutan en un Web Worker para mantener la interfaz disponible. Se leen rangos del archivo y se devuelven páginas, sin materializar toda la tabla. La búsqueda y el ordenamiento pueden recorrer muchos datos. La memoria de DuckDB está limitada a 768 MB y existen otros límites del navegador; archivos grandes o filas muy pesadas pueden agotar recursos. No hay un tamaño máximo universal garantizado. Para esos casos está la aplicación Python independiente.

Las consultas se serializan y los resultados anteriores se descartan al cambiar de búsqueda o archivo. La nulabilidad describe el esquema, no el número real de celdas nulas.

## Estructura

- `src/engine.js`: motor WASM, registro de archivos y consultas.
- `src/main.js`: interacción y presentación.
- `src/style.css`: estilos adaptables.
- `scripts/prepare-duckdb.mjs`: prepara binarios locales.
- `scripts/netlify-headers.mjs`: prepara encabezados para despliegue manual.
- `netlify.toml`: build, publicación y encabezados de seguridad.

Referencias: [DuckDB-Wasm](https://duckdb.org/docs/stable/clients/wasm/overview), [lectura de archivos](https://duckdb.org/docs/stable/clients/wasm/data_ingestion), [Netlify](https://docs.netlify.com/).
