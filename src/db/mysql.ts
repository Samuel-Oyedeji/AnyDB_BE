import mysql from 'mysql2/promise';
import { ConnectRequestBody, DBConnection } from './index';

export async function createMySQLConnection(config: ConnectRequestBody): Promise<DBConnection> {
  const connection = await mysql.createConnection({
    host: config.host,
    port: parseInt(config.port),
    user: config.username,
    password: config.password,
    database: config.database,
  });

  return {
    query: async (query: string, params?: any[]) => connection.query(query, params),
    listTablesOrCollections: async () => {
      const [rows] = await connection.query('SHOW TABLES') as [mysql.RowDataPacket[], mysql.FieldPacket[]];
      return rows.map((row) => Object.values(row)[0] as string);
    },
    end: async () => connection.end(),
  };
}