// Get the client
import mysql from 'mysql2/promise';

const getConnection = async () => {
    // Create the connection to database
    const connection = await mysql.createConnection({
        port: 3306,
        host: 'localhost',
        user: 'root',
        password: "123456789",
        database: 'nodejspro',
    });
    return connection;
}



export default getConnection ;