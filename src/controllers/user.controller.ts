import { Request, Response } from 'express';
import { getAllUsers, getUserById, handleCreateUser, handleDeleteUser } from 'services/user.service';

const getHomePage = async (req: Request, res: Response) => {
    const users = await getAllUsers();
    return res.render("home", {
        users: users
    });
}
const getCreateUserPage = (req: Request, res: Response) => {
    return res.render("create-user");
}
const postCreateUser = async (req: Request, res: Response) => {
    const { fullName, email, address } = req.body;

    // handle create user logic
    await handleCreateUser(fullName, email, address);
    return res.redirect("/");
}

const postDeleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle delete user logic
    await handleDeleteUser(Number(id));
    // redirect to home page
    return res.redirect("/");
}
const getViewUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle view user logic
    const user = await getUserById(Number(id));
    return res.render("view-user", {
        id: id,
        user: user
    });

}

export { getHomePage, getCreateUserPage, postCreateUser, postDeleteUser, getViewUser };