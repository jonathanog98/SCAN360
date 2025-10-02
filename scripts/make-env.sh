#!/usr/bin/env bash
set -euo pipefail

# Netlify inyecta estas variables desde la sección "Environment variables"
: "${SUPABASE_URL:?Missing SUPABASE_URL env var}"
: "${SUPABASE_ANON_KEY:?Missing SUPABASE_ANON_KEY env var}"
: "${STORAGE_BUCKET:?Missing STORAGE_BUCKET env var}"

# Generar env.js con las claves para el frontend
cat > env.js <<EOL
window.SUPABASE_URL = "${SUPABASE_URL}";
window.SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
window.STORAGE_BUCKET = "${STORAGE_BUCKET}";
EOL

echo "✅ env.js generado con variables de Netlify"
