import { createMySQLConnection } from './mysql';
import { createPostgresConnection } from './postgres';
import { createMongoDBConnection } from './mongodb';

export interface ConnectRequestBody {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  dbType: string;
}

export interface DBConnection {
  query: (query: string, params?: any[]) => Promise<any[]>;
  listTablesOrCollections: () => Promise<string[]>;
  end: () => Promise<void>;
}

export async function connectToDatabase(config: ConnectRequestBody): Promise<DBConnection> {
  console.log(`Connecting to database with config: ${JSON.stringify(config)}`);
  if (config.dbType === 'mysql') {
    console.log('Attempting MySQL connection');
    return await createMySQLConnection(config);
  } else if (config.dbType === 'postgres') {
    console.log('Attempting Postgres connection');
    return await createPostgresConnection(config);
  } else if (config.dbType === 'mongodb') {
    console.log('Attempting MongoDB connection');
    return await createMongoDBConnection(config);
  } else {
    throw new Error(`Unsupported database type: ${config.dbType}`);
  }
}