import { Request, Response, RequestHandler, NextFunction } from 'express';
import { DBConnection } from '../db';
import { createObjectCsvStringifier } from 'csv-writer';

export interface RowData {
  [key: string]: any;
}

// Define expected return types from MongoDB queries
interface InsertResult { insertId: string }
interface DeleteResult { deletedCount: number }
interface CountResult { total: number }

export const getColumns: RequestHandler<{ table: string }> = async (req, res, next) => {
  const { table } = req.params;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    const [firstDoc] = await dbClient.query(`${table}.find`, [{}, { limit: 1 }]);
    const columns = firstDoc && firstDoc[0] ? Object.keys(firstDoc[0]) : [];
    res.json({ columns });
  } catch (error: any) {
    console.error('Column fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch columns', details: error.message });
  }
};

export const insertRow: RequestHandler<{ table: string }, any, RowData> = async (req, res, next) => {
  const { table } = req.params;
  const rowData = req.body;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    const filteredRowData = { ...rowData };
    if (filteredRowData.id === 'new' || !filteredRowData.id) delete filteredRowData.id;
    if (filteredRowData._id) delete filteredRowData._id;
    const result = await dbClient.query(`${table}.insert`, [filteredRowData]) as [InsertResult];
    console.log('Insert result:', result);
    const insertedId = result[0]?.insertId;
    if (insertedId) {
      res.json({ success: true, insertedId });
    } else {
      throw new Error('Insert failed - no insertedId returned');
    }
  } catch (error: any) {
    console.error('Insert error:', error);
    res.status(500).json({ error: 'Failed to insert row', details: error.message });
  }
};

export const updateRow: RequestHandler<{ table: string; id: string }, any, RowData> = async (req, res, next) => {
  const { table, id } = req.params;
  const rowData = req.body;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    const result = await dbClient.query(`${table}.update`, [id, rowData]) as [{ success: boolean }];
    console.log('Update result:', result);
    const success = result[0]?.success;
    if (success) {
      res.json({ success: true });
    } else {
      throw new Error('Update failed');
    }
  } catch (error: any) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update row', details: error.message });
  }
};

export const deleteRows: RequestHandler<{ table: string }, any, { ids: string[] }> = async (req, res, next) => {
  const { table } = req.params;
  const { ids } = req.body;
  const dbClient = req.app.locals.dbClient as DBConnection;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'No IDs provided for deletion' });
    return;
  }
  try {
    const result = await dbClient.query(`${table}.delete`, [ids]) as [DeleteResult];
    console.log('Delete result:', result);
    const deletedCount = result[0]?.deletedCount;
    if (deletedCount !== undefined && deletedCount > 0) {
      res.json({ success: true, deletedCount });
    } else {
      throw new Error('Delete failed - no rows deleted');
    }
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete rows', details: error.message });
  }
};

export const getTableData: RequestHandler<{ table: string }> = async (req, res, next) => {
  const { table } = req.params;
  const { limit = '10', offset = '0', sort, order = 'ASC', search, filters } = req.query;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    let query = `${table}.find`;
    let countQuery = `${table}.count`;
    let params: any[] = [];
    let mongoFilter: any = {};

    const [sampleRow] = await dbClient.query(`${table}.find`, [{}, { limit: 1 }]);
    const columns = Object.keys(sampleRow[0] || {});

    if (search) {
      mongoFilter.$or = columns.map((key) => ({
        [key]: { $regex: search, $options: 'i' },
      }));
    }

    if (filters) {
      const filterObj = JSON.parse(filters as string);
      for (const [col, value] of Object.entries(filterObj)) {
        if (!columns.includes(col)) {
          throw new Error(`Column "${col}" does not exist in table "${table}"`);
        }
        mongoFilter[col] = value;
      }
    }

    params = [mongoFilter, { limit: parseInt(limit as string), skip: parseInt(offset as string) }];
    if (sort) params[1].sort = { [sort as string]: order === 'ASC' ? 1 : -1 };

    const [rows] = await dbClient.query(query, params);
    const countResult = await dbClient.query(countQuery, [mongoFilter]) as [CountResult];
    console.log('countResult:', countResult);
    const totalRows = countResult[0]?.total ?? 0;

    res.json({ data: rows, total: totalRows });
  } catch (error: any) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to fetch table data', details: error.message });
  }
};

export const exportTable: RequestHandler<{ table: string }> = async (req, res, next) => {
  const { table } = req.params;
  const { format = 'json' } = req.query;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    const [rows] = await dbClient.query(`${table}.find`, [{}, {}]);

    if (format === 'csv') {
      const csvStringifier = createObjectCsvStringifier({
        header: Object.keys(rows[0] || {}).map((key) => ({ id: key, title: key })),
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
      res.write(csvStringifier.getHeaderString());
      res.write(csvStringifier.stringifyRecords(rows));
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.json"`);
      res.json(rows);
    }
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data', details: error.message });
  }
};