import { NextFunction, Request, Response } from "express";
import { registerNewUser } from "services/client/auth.service";
import { RegisterSchema, TRegisterSchema } from "src/validation/register.shema";

const getLoginPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/auth/login.ejs", {
        messages
    });
}

const getTermPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/policies/terms.ejs", {
        messages
    });
}
const getWarrantyPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/policies/warranty.ejs", {
        messages
    });
}
const getReturnPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/policies/return.ejs", {
        messages
    });
}
const getPrivacyPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/policies/privacy.ejs", {
        messages
    });
}
const getContactPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/contacts/contact.ejs", {
        messages
    });
}
const getAboutUsPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/about/us.ejs", {
        messages
    });
}
const getSupportPage = async (req: Request, res: Response) => {
    const { session } = req as any;
    const messages = session?.messages ?? [];
    return res.render("client/supports/support.ejs", {
        messages
    });
}

const postRegister = async (req: Request, res: Response) => {
    const { fullName, email, password, confirmPassword } = req.body as TRegisterSchema;

    const validate = await RegisterSchema.safeParseAsync(req.body);
    if (!validate.success) {
        const errorsZod = validate.error.issues;
        const errors = errorsZod?.map(item => `${item.message} (${item.path[0]}) `);

        const oldData = {
            fullName, email, password, confirmPassword
        }
        return res.render("client/auth/register.ejs", { errors, oldData });
    }
    await registerNewUser(fullName, email, password);
    return res.redirect("/login");
}

const getSuccessRedirectPage = async (req: Request, res: Response) => {
    const user = req.user as any;
    if (user?.role?.name === "ADMIN") {
        return res.redirect("/admin");
    } else {
        return res.redirect("/");
    }

}
const postLogout = async (req: Request, res: Response, next: NextFunction) => {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect("/");
    });

}



export { getLoginPage, postRegister, getSuccessRedirectPage, postLogout, getTermPage, getWarrantyPage, getReturnPage, getPrivacyPage, getContactPage, getAboutUsPage, getSupportPage };
