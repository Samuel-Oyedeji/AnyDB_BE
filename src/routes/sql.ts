import { Request, Response, RequestHandler, NextFunction } from 'express';
import { DBConnection } from '../db';
import { createObjectCsvStringifier } from 'csv-writer';

export interface RowData {
  [key: string]: any;
}

export const getColumns: RequestHandler<{ table: string }> = async (req, res, next) => {
  const { table } = req.params;
  const dbClient = req.app.locals.dbClient as DBConnection;
  try {
    const [rows] = await dbClient.query(`DESCRIBE ${table}`);
    const columns = rows.map((row: any) => row.Field || row.column_name);
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
    const query = `INSERT INTO ${table} (${Object.keys(filteredRowData).join(', ')}) VALUES (${Object.keys(filteredRowData).map(() => '?').join(', ')})`;
    const values = Object.values(filteredRowData);
    const [result] = await dbClient.query(query, values);
    const insertedId = (result as any).insertId;
    if (insertedId) {
      res.json({ success: true, insertedId });
    } else {
      throw new Error('Insert failed');
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
    const query = `UPDATE ${table} SET ${Object.keys(rowData).map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
    const values = [...Object.values(rowData), id];
    const [result] = await dbClient.query(query, values);
    const success = (result as any).affectedRows > 0;
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
    const query = `DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')})`;
    const [result] = await dbClient.query(query, ids);
    const deletedCount = (result as any).affectedRows;
    if (deletedCount > 0) {
      res.json({ success: true, deletedCount });
    } else {
      throw new Error('Delete failed');
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
    let query = `SELECT * FROM ${table}`;
    let countQuery = `SELECT COUNT(*) as total FROM ${table}`;
    let params: any[] = [];
    let whereClauses: string[] = [];

    const [sampleRow] = await dbClient.query(`SELECT * FROM ${table} LIMIT 1`);
    const columns = Object.keys(sampleRow[0] || {});

    if (search) {
      whereClauses.push(columns.map((col) => `${col} ILIKE ?`).join(' OR '));
      params.push(...columns.map(() => `%${search}%`));
    }

    if (filters) {
      const filterObj = JSON.parse(filters as string);
      for (const [col, value] of Object.entries(filterObj)) {
        if (!columns.includes(col)) {
          throw new Error(`Column "${col}" does not exist in table "${table}"`);
        }
        whereClauses.push(`${col} = ?`);
        params.push(value);
      }
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
      countQuery += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (sort) query += ` ORDER BY ${sort} ${order}`;
    query += ` LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}`;

    const [rows] = await dbClient.query(query, params);
    const [countResult] = await dbClient.query(countQuery, params);
    const totalRows = countResult[0].total || 0;

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
    const [rows] = await dbClient.query(`SELECT * FROM ${table}`);

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