import { Request, Response } from 'express';
import { handleCreateUser } from '../services/user.service';

const getHomePage = (req: Request, res: Response) => {
    return res.render("home");
}
const getCreateUserPage = (req: Request, res: Response) => {
    return res.render("create-user");
}
const postCreateUser = (req: Request, res: Response) => {
    const { fullName, email, address } = req.body;

    // handle create user logic
    handleCreateUser(fullName, email, address);
    return res.redirect("/");
}

export { getHomePage, getCreateUserPage, postCreateUser };