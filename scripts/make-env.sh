#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_URL:?Missing SUPABASE_URL env var}"
: "${SUPABASE_ANON_KEY:?Missing SUPABASE_ANON_KEY env var}"
: "${STORAGE_BUCKET:?Missing STORAGE_BUCKET env var}"
cat > env.js <<EOL
window.SUPABASE_URL = "${SUPABASE_URL}";
window.SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
window.STORAGE_BUCKET = "${STORAGE_BUCKET}";
EOL
echo "✅ env.js generado"
