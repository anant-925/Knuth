const { MongoClient, ServerApiVersion } = require('mongodb'); //including the mongoDB package

function buildMongoURI() {
    if (process.env.MONGO_URI && process.env.MONGO_URI.trim()) {
        return process.env.MONGO_URI.trim();
    }

    const username = process.env.DBUsername;
    const password = process.env.DBPassword;
    const clusterAddress = process.env.ClusterAddress;

    if (!username || !password || !clusterAddress) {
        return null;
    }

    return `mongodb+srv://${username}:${password}@${clusterAddress}/`;
}

const mongoURI = buildMongoURI();
let client = null;

function getClient() {
    if (!mongoURI) {
        throw new Error(
            'MongoDB is not configured. Set MONGO_URI or DBUsername, DBPassword, and ClusterAddress before starting the server.'
        );
    }

    if (!client) {
        client = new MongoClient(mongoURI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true, //generate errors when deprecated MongoDB features are used
            }
        });
    }

    return client;
}

async function connectDB() {
    try {
        if (!mongoURI) {
            console.warn('MongoDB connection skipped because the connection string is missing.');
            return;
        }

        await getClient().connect();
        console.log("Connected to the database");
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}


async function writeDB(Database, Collection, Data) { //Create Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);
        
        const result = await collection.insertOne(Data);
        
        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function readDB(Database, Collection, Query) { //Read Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.find(Query).toArray();

        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function readwithSortDB(Database, Collection, FindQuery, SortQuerry) { //Read Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.find(FindQuery).sort(SortQuerry).toArray();

        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function updateDB(Database, Collection, FindQuery, UpdateQuery) { //Update Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.updateOne(FindQuery,UpdateQuery);

        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function deleteDB(Database, Collection, Query) { //Delete Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.deleteMany(Query);

        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function countDocuments(Database, Collection, Query) { //Count Entries
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.countDocuments(Query);

        return result;

    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function SkipRead(Database, Collection, Query, sortQuery, Skip, Limit) { //Read Entry
    try {
        const db = getClient().db(Database);
        const collection = db.collection(Collection);

        const result = await collection.find(Query).sort(sortQuery).skip(Skip).limit(Limit).toArray();

        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error; // Rethrow the error for the caller to handle
    }
}

module.exports = {connectDB, writeDB, readDB, updateDB, deleteDB, countDocuments, SkipRead , readwithSortDB};