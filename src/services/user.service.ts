import getConnection from "config/database";


const handleCreateUser = async (
    fullName: string,
    email: string,
    address: string,
) => {

    //insert user into database
    const connection = await getConnection();

    try {


        const sql = 'INSERT INTO `users`(`name`, `email`, `address`) VALUES (?, ?, ?)';
        const values = [fullName, email, address];
        const [result, fields] = await connection.execute(sql, values);
        return result;

    } catch (err) {
        console.log(err);
        return [];
    }
}
const getAllUsers = async () => {
    const connection = await getConnection();
    // A simple SELECT query
    try {
        const [results, fields] = await connection.query(
            'SELECT * FROM `users` '
        );
        return results;
    } catch (err) {
        console.log(err);
        return [];
    }
}

const handleDeleteUser = async (id: number) => {

    try {
        const connection = await getConnection();
        const sql = 'DELETE FROM `users` WHERE id = ? LIMIT 1';
        const values = [id];
        const [result, fields] = await connection.execute(sql, values);
        return result;
    } catch (err) {
        console.log(err);
        return [];
    }
}

const getUserById = async (id: number) => {

    try {
        const connection = await getConnection();
        const sql = 'SELECT * FROM `users` WHERE id = ? LIMIT 1';
        const values = [id];
        const [result, fields] = await connection.execute(sql, values);
        return result[0]; // Return the first user found
    } catch (err) {
        console.log(err);
        return [];
    }
}
export { handleCreateUser, getAllUsers, handleDeleteUser, getUserById };

