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

## Generación de Parquet

Se agregaron seis pruebas de conversión WASM y cinco de API Python. Los conjuntos completos tienen once pruebas en Web (`npm test`) y doce en Python (`python -m unittest -v test_conversion test_sql`). Cubren delimitadores CSV, Unicode, campos entrecomillados con saltos de línea, inferencia de tipos, CSV sin encabezado, conservación de ceros como texto, Windows-1252 en Python, XLSX/XLS, selección de hoja, fechas, datos vacíos, fórmulas sin resultados y archivos mal formados. Se verifica la lectura del Parquet resultante y se comparan tamaños reales, incluidos resultados mayores que el original. En Python se comprueba que los archivos generados se puedan descargar incluso después de cerrarlos en el visor.

Prueba de producción en Chromium con CSP: un CSV de 12.000 filas pasó de 264.026 bytes a un Parquet de 12.801 bytes (95,2 % de ahorro), se descargó a la carpeta de descargas y se abrió automáticamente. Un XLSX de dos hojas permitió elegir Personas y generó un Parquet de dos filas con nombres Unicode y fechas correctas. En la interfaz Python se comprobó la selección de hoja del mismo XLSX, la descarga real y la apertura automática de sus dos filas. También se verificó XLS mediante el motor Python. Los archivos de prueba son sintéticos y están excluidos del deploy.

## Editor SQL

Agregada la pestaña SQL a Web y Python. `npm test` ejecuta cinco pruebas con el motor WASM real: filtro con backticks, precisión de BIGINT, paginación y orden numérico, agrupación con HAVING y LIMIT, resultados vacíos, literales con apóstrofos y rechazo de otras fuentes o múltiples sentencias. La API Python tiene siete pruebas equivalentes y verificaciones de acceso a archivos y módulos estáticos (`python -m unittest -v test_sql`).

Se verificó en la interfaz de ambas versiones `SELECT * FROM parquet WHERE persona_id = 42325` sobre un archivo sintético de 230 filas: devolvió una fila con el identificador esperado y un valor nulo. En Web también se verificó el botón Contar filas y el encabezado dinámico `total`. El nuevo build mantiene la configuración de Netlify y los encabezados CSP.

Para repetir las pruebas, usar archivos sintéticos con estos tipos, ejecutar `npm ci`, `npm run build`, `npm run preview`, seleccionar los archivos y recorrer estos casos. Los archivos y capturas de prueba locales están en `test-results/`, excluido de Git y del deploy.
