import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Render (and most hosted Postgres providers) give you a single connection
// string rather than separate host/user/password variables, and require SSL
// for that connection. Locally there's no DATABASE_URL, so we fall back to
// the discrete DB_* variables with no SSL, exactly as before.
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    })
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    });

export default pool;
