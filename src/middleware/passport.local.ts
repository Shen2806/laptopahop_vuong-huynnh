import { prisma } from "config/client";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { comparePassword } from "services/user.service";

const configPassportLocal = () => {
    // Cấu hình Local Strategy
    passport.use(new LocalStrategy({

    }, async function verify(username, password, callback) {
        console.log(">>>check user / pass:", username, password);
        // Gọi hàm handleLogin từ auth.service để kiểm tra đăng nhập
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return callback(null, false, { message: 'Tài khoản ${username}không tìm thấy !' });
            // throw new Error(`Tài khoản ${username}không tìm thấy !`);
        }
        // compare password
        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
            // throw new Error("Mật khẩu không đúng !");
            return callback(null, false, { message: 'Mật khẩu không đúng !' });
        }
        return callback(null, user);
    }));
    passport.serializeUser(function (user: any, cb) {
        process.nextTick(function () {
            cb(null, { id: user.id, username: user.username });
        });
    });

    passport.deserializeUser(function (user, cb) {
        process.nextTick(function () {
            return cb(null, user);
        });
    });
}
export default configPassportLocal;
