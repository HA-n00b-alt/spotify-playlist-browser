# Database Migration Guide

## Running the Migration

The `track_bpm_cache` table needs to be created in your Neon Postgres database before BPM detection will work.

### Option 1: Using Neon SQL Editor (Easiest)

1. Go to your Neon dashboard: https://console.neon.tech
2. Select your `song-bpm-storage` database
3. Click on "SQL Editor" in the left sidebar
4. Copy the contents of `migrations/001_create_track_bpm_cache.sql`
5. Paste it into the SQL editor
6. Click "Run" to execute

### Option 2: Using psql Command Line

If you have `psql` installed locally:

```bash
# Set your unpooled connection string
export DATABASE_URL_UNPOOLED="postgresql://user:password@host/database?sslmode=require"

# Run the migration
psql $DATABASE_URL_UNPOOLED -f migrations/001_create_track_bpm_cache.sql
```

### Option 3: Using Node.js Script

Create a temporary script to run the migration:

```bash
# Create migrate.js
cat > migrate.js << 'EOF'
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (!DATABASE_URL_UNPOOLED) {
  console.error('DATABASE_URL_UNPOOLED environment variable is not set')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL_UNPOOLED,
  ssl: { rejectUnauthorized: false },
})

const sql = fs.readFileSync(
  path.join(__dirname, 'migrations', '001_create_track_bpm_cache.sql'),
  'utf8'
)

pool.query(sql)
  .then(() => {
    console.log('Migration completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => {
    pool.end()
  })
EOF

# Run it
node migrate.js

# Clean up
rm migrate.js
```

## Verifying the Migration

After running the migration, you can verify it worked by:

1. **Using Neon Dashboard:**
   - Go to your database in Neon console
   - Check the "Tables" section - you should see `track_bpm_cache`

2. **Using the Debug Endpoint:**
   - Visit: `https://your-domain.com/api/debug/db`
   - This will show if the table exists and connection status

3. **Using SQL:**
   ```sql
   SELECT * FROM track_bpm_cache LIMIT 1;
   ```

## Environment Variables

Make sure these are set in your Vercel project:

- `DATABASE_URL` - Neon pooled connection string (for runtime)
- `DATABASE_URL_UNPOOLED` - Neon direct connection string (for migrations)

You can find these in your Neon dashboard under "Connection Details".

## Troubleshooting

If the migration fails:

1. **Check connection string format:**
   - Should start with `postgresql://`
   - Should include `?sslmode=require` at the end

2. **Check database permissions:**
   - Make sure your database user has CREATE TABLE permissions

3. **Check Neon dashboard:**
   - Verify the database exists
   - Check connection strings are correct

4. **Check Vercel environment variables:**
   - Go to Vercel project settings → Environment Variables
   - Verify `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are set

