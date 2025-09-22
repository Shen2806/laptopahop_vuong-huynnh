import { NextFunction, Request, Response } from "express";
import { getUserWithRoleById, registerNewUser } from "services/client/auth.service";
import { RegisterSchema, TRegisterSchema } from "src/validation/register.shema";
import jwt from "jsonwebtoken";
import passport from "passport";
import { prisma } from "config/client";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "services/client/token.service";

const getLoginPage = async (req: Request, res: Response) => {
    const session: any = (req as any).session;

    const messages = Array.isArray(session?.messages) ? session.messages.slice() : [];
    const oldData = session?.oldData || {};

    // Clear sau khi đọc để không hiển thị lặp
    if (session) {
        session.messages = [];
        session.oldData = null;
    }

    return res.render("client/auth/login.ejs", {
        messages,
        oldData, // đẩy ra view để fill lại email
    });
};


// LOGIN
const postLogin = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { username },
            include: { role: true },
        });
        if (!user) return res.status(401).json({ message: "Username không tồn tại" });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(401).json({ message: "Sai mật khẩu" });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set cookies
        res.cookie("access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000, // 15 phút
        });

        res.cookie("refresh_token", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
        });

        return res.json({
            message: "Đăng nhập thành công",
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            },
            accessToken,
            refreshToken,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Lỗi server" });
    }
};

// REFRESH TOKEN
const refreshToken = (req: Request, res: Response) => {
    const token = req.cookies.refresh_token;
    if (!token) return res.status(401).json({ message: "Không có refresh token" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as any;
        const newAccessToken = generateAccessToken(decoded);

        res.cookie("access_token", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        return res.json({ message: "Access token mới đã được cấp", accessToken: newAccessToken });
    } catch (err) {
        return res.status(403).json({ message: "Refresh token không hợp lệ" });
    }
};
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

// const getSuccessRedirectPage = async (req: Request, res: Response) => {
//     const user = req.user as any;
//     if (user?.role?.name === "ADMIN") {
//         return res.redirect("/admin");
//     } else {
//         return res.redirect("/");
//     }

// }

const getSuccessRedirectPage = async (req: any, res: any) => {
    const hasAT = Boolean(req.cookies?.access_token);
    const hasRT = Boolean(req.cookies?.refresh_token);

    if (!hasAT && hasRT) {
        try {
            const payload: any = jwt.verify(req.cookies.refresh_token, process.env.JWT_REFRESH_SECRET!);
            const user = await getUserWithRoleById(payload.id);
            if (user) {
                const at = generateAccessToken(user);
                const isProd = process.env.NODE_ENV === "production";
                res.cookie("access_token", at, {
                    httpOnly: true,
                    sameSite: isProd ? "none" : "lax",
                    secure: isProd,
                    path: "/",
                    maxAge: 15 * 60 * 1000,
                });
            }
        } catch (e) {
            // refresh hỏng thì quay lại login
            return res.redirect("/login");
        }
    }

    const roleName = String(req.user?.role?.name || req.user?.roleName || "").toLowerCase();
    if (roleName.includes("admin")) return res.redirect("/admin");
    return res.redirect("/");
};

const postLogout = async (req: Request, res: Response, next: NextFunction) => {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect("/");
    });

}



export { getLoginPage, postRegister, getSuccessRedirectPage, postLogout, getTermPage, getWarrantyPage, getReturnPage, getPrivacyPage, getContactPage, getAboutUsPage, getSupportPage, postLogin, refreshToken };
