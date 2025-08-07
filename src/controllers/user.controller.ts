import { Request, Response } from 'express';

const getHomePage = (req: Request, res: Response) => {
    return res.render("home");
}
const getCreateUserPage = (req: Request, res: Response) => {
    return res.render("create-user");
}
const postCreateUser = (req: Request, res: Response) => {
    console.log(req.body);
    return res.redirect("/");
}

export { getHomePage, getCreateUserPage, postCreateUser };