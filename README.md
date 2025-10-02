
# Inspecciones digitales (Supabase + HTML)

MVP para inspecciones de **salida** y **entrada** por tablilla, con fotos y cierre.

## Pasos

1. **Crea un proyecto en Supabase** (gratis).
2. En **SQL** pega y corre `schema.sql`.
3. En **Storage**, crea el bucket público `inspecciones-fotos`.
4. En **Authentication**, habilita Email (magic link).
5. Descarga esta carpeta (o súbela a Netlify/GitHub Pages) y en `env.js` reemplaza:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Abre `index.html` (móvil o desktop), escribe la tablilla y comienza.

## Checklist
Edita `checklist.json` para añadir/quitar puntos. La primera vez que creas una **salida**, se generan las filas de ese checklist para el caso.

## Funcionamiento
- `index.html`: buscar y saltar a salida o entrada por tablilla.
- `salida.html`: marca Sí/No/No Aplica, sube fotos, registra "Entregado por".
- `entrada.html`: ves la columna de salida a la izquierda, marcas la entrada, subes fotos, registras "Recibido por" y **cierras** el caso.

Al cerrar, se bloquean cambios a puntos/fotos por trigger. Todo queda almacenado por **tablilla** y **fechas**.

## Reportes
En SQL hay una vista `v_inspections_summary`. Puedes crear un dashboard en Supabase o exportar a CSV.

---

> Sugerencias: añadir firma digital (canvas), más RLS por roles, y QR por tablilla para abrir el caso directo en mobile.
