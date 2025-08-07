import { Request, Response } from 'express';

const getHomePage = (req: Request, res: Response) => {
    return res.render("home");
}
const getCreateUserPage = (req: Request, res: Response) => {
    return res.render("create-user");
}

export { getHomePage, getCreateUserPage };