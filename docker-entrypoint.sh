#!/bin/sh
set -e

# Ensure data and statement directories exist and have proper permissions for nextjs user
mkdir -p /app/data /app/data/statements
chown -R nextjs:nodejs /app/data /app/data/statements || true
chmod -R 775 /app/data /app/data/statements || true

# Execute Next.js server as the non-root nextjs user
exec su-exec nextjs node server.js "$@"
