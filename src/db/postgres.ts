import { Pool } from 'pg';
import { ConnectRequestBody, DBConnection } from './index';

export async function createPostgresConnection(config: ConnectRequestBody): Promise<DBConnection> {
  const pool = new Pool({
    host: config.host,
    port: parseInt(config.port),
    user: config.username,
    password: config.password,
    database: config.database,
  });

  return {
    query: async (query: string, params?: any[]) => {
      // Replace ? placeholders with $1, $2, etc.
      if (params && params.length > 0) {
        let paramIndex = 1;
        query = query.replace(/\?/g, () => `$${paramIndex++}`);
      }
      const { rows } = await pool.query(query, params);
      return [rows];
    },
    listTablesOrCollections: async () => {
      const { rows } = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      return rows.map((row) => row.table_name);
    },
    end: async () => pool.end(),
  };
}