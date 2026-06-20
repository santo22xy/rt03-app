// Try common passwords for postgres role di Supabase
import pg from 'pg'
import 'dotenv/config'

// Format connection string: postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
// atau direct: postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres

const ref = 'kjnmyiqzamftysgndbne'
const passwords = ['', 'postgres', 'password', 'supabase']

async function tryConn(pwd) {
  const client = new pg.Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: pwd,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  })
  try {
    await client.connect()
    const r = await client.query('SELECT 1 AS ok')
    console.log(`Password '${pwd || '(empty)'}' WORKS!`)
    await client.end()
    return true
  } catch (e) {
    console.log(`Password '${pwd || '(empty)'}' failed: ${e.message.split('\n')[0]}`)
    return false
  }
}

async function run() {
  for (const p of passwords) {
    if (await tryConn(p)) {
      console.log('\nFOUND IT! Use password:', JSON.stringify(p))
      process.exit(0)
    }
  }
  console.log('\nNo password worked')
  process.exit(1)
}

run().catch(console.error).finally(() => process.exit())