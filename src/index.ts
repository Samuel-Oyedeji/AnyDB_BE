import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToDatabase, DBConnection, ConnectRequestBody } from './db';
import * as mongoRoutes from './routes/mongodb';
import * as sqlRoutes from './routes/sql';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Root endpoint to test backend
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

let lastConnection: ConnectRequestBody | null = null;

app.post('/connect', async (req: Request<{}, any, ConnectRequestBody>, res: Response) => {
  const config = req.body;
  try {
    const connection = await connectToDatabase(config);
    const tables = await connection.listTablesOrCollections();
    lastConnection = config;
    app.locals.dbClient = connection;
    res.json({ status: 'connected', tables });
  } catch (error: any) {
    console.error('Connection error:', error);
    res.status(500).json({ error: 'Failed to connect to database' });
  }
});

// Middleware to check connection
const requireConnection = (req: Request, res: Response, next: NextFunction) => {
  if (!lastConnection || !app.locals.dbClient) {
    res.status(400).json({ error: 'No active connection. Please connect first.' });
    return;
  }
  next();
};

// Route handlers based on dbType with type casting
app.get('/columns/:table', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string }>;
  (isMongo ? mongoRoutes.getColumns : sqlRoutes.getColumns)(typedReq, res, next);
});

app.post('/data/:table', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string }, any, mongoRoutes.RowData>;
  (isMongo ? mongoRoutes.insertRow : sqlRoutes.insertRow)(typedReq, res, next);
});

app.put('/data/:table/:id', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string; id: string }, any, mongoRoutes.RowData>;
  (isMongo ? mongoRoutes.updateRow : sqlRoutes.updateRow)(typedReq, res, next);
});

app.delete('/data/:table', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string }, any, { ids: string[] }>;
  (isMongo ? mongoRoutes.deleteRows : sqlRoutes.deleteRows)(typedReq, res, next);
});

app.get('/data/:table', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string }>;
  (isMongo ? mongoRoutes.getTableData : sqlRoutes.getTableData)(typedReq, res, next);
});

app.get('/export/:table', requireConnection, (req, res, next) => {
  const isMongo = lastConnection!.dbType === 'mongodb';
  const typedReq = req as Request<{ table: string }>;
  (isMongo ? mongoRoutes.exportTable : sqlRoutes.exportTable)(typedReq, res, next);
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});