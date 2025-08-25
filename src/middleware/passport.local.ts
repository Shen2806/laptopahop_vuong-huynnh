import { prisma } from "config/client";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { comparePassword, getUserById } from "services/user.service";

const configPassportLocal = () => {
    // Cấu hình Local Strategy
    passport.use(new LocalStrategy({
        passReqToCallback: true,
    }, async function verify(req, username, password, callback) {
        const { session } = req as any;
        if (session?.messages?.length) {
            session.messages = [];
        }
        console.log(">>>check user / pass:", username, password);
        // Gọi hàm handleLogin từ auth.service để kiểm tra đăng nhập
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return callback(null, false, { message: `Tài khoản/Mật khẩu không hợp lệ !` });
        }
        // compare password
        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
            // throw new Error("Mật khẩu không đúng !");
            return callback(null, false, { message: 'Tài khoản/Mật khẩu không hợp lệ !' });
        }
        return callback(null, user);
    }));
    passport.serializeUser(function (user: any, callback) {
        callback(null, { id: user.id, username: user.username });
    });

    passport.deserializeUser(async function (user: any, callback) {
        const { id, username } = user;
        const userInDB = await getUserById(id);
        return callback(null, { ...user, name: "minhvuong" });
    });
}
export default configPassportLocal;
