# Verificación

Validado el 23 de octubre de 2026 con Node.js 22.19.0, DuckDB-Wasm 1.32.0 (motor 1.4.3), Vite 7.3.7 y el navegador integrado Chromium.

Se sirvió `dist/` por HTTP con los encabezados de seguridad de `netlify.toml`, incluida la política CSP. Se probó la salida de producción, sin servidor Python para consultar datos. El servidor HTTP de prueba solo sirvió los archivos estáticos.

Casos comprobados en la interfaz:

- Apertura de un Parquet ZSTD con 125 filas y 7 columnas.
- Nulos, BIGINT mayor que `Number.MAX_SAFE_INTEGER`, DECIMAL(18,2), DATE, TIMESTAMP con microsegundos y STRUCT con una lista anidada.
- Búsqueda de `hola 124`: exactamente una fila.
- Página siguiente: filas 101–125, sin página posterior.
- Orden numérico ascendente y descendente: inicio en 0 y 124 respectivamente.
- Esquema con tipos y nulabilidad.
- Diálogo con contenido completo de la estructura anidada.
- Apertura de un segundo Parquet vacío: 0 filas y navegación deshabilitada.
- Archivo inválido: mensaje legible y conservación del archivo anterior.
- Cierre del segundo archivo y recuperación del primero.
- En el build final, selección múltiple con un archivo inválido seguido de uno válido: el válido se abre y el error se informa.

Verificaciones de proyecto: `npm run build`, comprobación de sintaxis de los módulos y `git diff --check`. La instalación inicial informó cero vulnerabilidades. Se verificó que OpenParquetPY siguiera sin cambios en Git.

No se realizó un despliegue público ni se verificó todavía en Safari, Firefox o dispositivos móviles reales. No se garantizan archivos de tamaño arbitrario; el rendimiento depende del navegador, memoria, tipos y operaciones consultadas.

Para repetir las pruebas, usar archivos sintéticos con estos tipos, ejecutar `npm ci`, `npm run build`, `npm run preview`, seleccionar los archivos y recorrer estos casos. Los archivos y capturas de prueba locales están en `test-results/`, excluido de Git y del deploy.
