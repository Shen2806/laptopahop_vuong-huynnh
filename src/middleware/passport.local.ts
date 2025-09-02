

import { prisma } from "config/client";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { getUserSumCart, getUserWithRoleById } from "services/client/auth.service";
import { comparePassword } from "services/user.service";

const configPassportLocal = () => {
    passport.use(new LocalStrategy(
        { passReqToCallback: true, usernameField: "username", passwordField: "password" },
        async function verify(req, username, password, done) {
            try {
                const user = await prisma.user.findUnique({ where: { username } });
                if (!user) {
                    return done(null, false, { message: "Tài khoản/Mật khẩu không hợp lệ !" });
                }
                const isMatch = await comparePassword(password, user.password);
                if (!isMatch) {
                    return done(null, false, { message: "Tài khoản/Mật khẩu không hợp lệ !" });
                }
                return done(null, user as any); // user đầy đủ từ DB
            } catch (err) {
                return done(err);
            }
        }
    ));

    // Lưu id vào session
    passport.serializeUser((user: any, done) => {
        done(null, user.id);
    });

    // Lấy user đầy đủ từ DB nhờ id
    passport.deserializeUser(async (id: number, done) => {
        try {
            const sumCart = await getUserSumCart(id)
            console.log(">>> check sumCart: ", sumCart)
            const userInDB: any = await getUserWithRoleById(Number(id));
            if (!userInDB) return done(null, false);
            return done(null, { ...userInDB, sumCart: sumCart });
        } catch (err) {
            return done(err);
        }
    });
};

export default configPassportLocal;
