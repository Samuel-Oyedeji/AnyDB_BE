import { MongoClient, ObjectId } from 'mongodb';
import { ConnectRequestBody, DBConnection } from './index';

export async function createMongoDBConnection(config: ConnectRequestBody): Promise<DBConnection> {
  const url = `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}?authSource=admin`;
  console.log(`Attempting MongoDB connection with URL: mongodb://${config.username}:[masked]@${config.host}:${config.port}/${config.database}`);
  try {
    const client = new MongoClient(url, { connectTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(config.database);
    console.log(`Connected to MongoDB database: ${config.database}`);

    return {
      query: async (query: string, params?: any[]) => {
        const [collection, operation] = query.split('.');
        if (operation === 'find') {
          const options = params?.[1] || {};
          const cursor = db.collection(collection).find(params?.[0] || {});
          if (options.skip) cursor.skip(options.skip);
          if (options.limit) cursor.limit(options.limit);
          if (options.sort) cursor.sort(options.sort);
          return [await cursor.toArray()];
        } else if (operation === 'insert') {
          const result = await db.collection(collection).insertOne(params![0]);
          return [{ insertId: result.insertedId.toString() }]; // Return as string for consistency
        } else if (operation === 'update') {
          const [id, updates] = params!;
          await db.collection(collection).updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
          );
          return [{ success: true }];
        } else if (operation === 'delete') {
          const ids = params![0].map((id: string) => new ObjectId(id));
          const result = await db.collection(collection).deleteMany({ _id: { $in: ids } });
          return [{ deletedCount: result.deletedCount }];
        } else if (operation === 'count') {
          const count = await db.collection(collection).countDocuments(params?.[0] || {});
          return [{ total: count }];
        }
        throw new Error('Unsupported MongoDB operation');
      },
      listTablesOrCollections: async () => {
        const collections = await db.listCollections().toArray();
        return collections.map((col) => col.name);
      },
      end: async () => {
        await client.close();
        console.log('MongoDB connection closed');
      },
    };
  } catch (error: any) {
    console.error('MongoDB connection failed:', error);
    throw error;
  }
}