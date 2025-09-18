// src/middleware/passport.google.ts
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import "dotenv/config";
import crypto from "crypto";

import { prisma } from "config/client";
import { ACCOUNT_TYPE } from "config/constant";
import { hashPassword } from "services/user.service";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.warn("[passport.google] Missing envs -> GoogleStrategy NOT registered.");
} else {
    passport.use(
        new GoogleStrategy(
            {
                clientID: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                callbackURL: GOOGLE_CALLBACK_URL,
            },
            async (_at: string, _rt: string, profile: Profile, done) => {
                try {
                    const email = profile.emails?.[0]?.value;
                    if (!email) return done(null, false, { message: "Google không cung cấp email" });

                    // 1) Tìm user theo googleId hoặc email — NHỚ include role
                    let user = await prisma.user.findFirst({
                        where: {
                            OR: [{ googleId: profile.id }, { username: email }],
                        },
                        include: { role: true },
                    });

                    // 2) Nếu chưa có -> tạo mới
                    if (!user) {
                        const userRole = await prisma.role.findUnique({ where: { name: "USER" } });
                        if (!userRole) return done(null, false, { message: "ROLE USER không tồn tại" });

                        // ❗ Password NOT NULL -> dùng mật khẩu ngẫu nhiên đã hash
                        const randomPwd = crypto.randomUUID();
                        const hashed = await hashPassword(randomPwd);

                        user = await prisma.user.create({
                            data: {
                                username: email,
                                password: hashed, // ✅ string, không phải null
                                fullName: profile.displayName || email,
                                accountType: ACCOUNT_TYPE.GOOGLE,
                                roleId: userRole.id,
                                googleId: profile.id,
                                avatar: profile.photos?.[0]?.value ?? null,
                                // address/phone nếu schema cho phép null thì có thể để trống
                            },
                            include: { role: true }, // ✅ Để có user.role ngay sau create
                        });
                    }
                    // 3) Nếu đã tồn tại theo email nhưng chưa liên kết Google -> cập nhật
                    else if (!user.googleId) {
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { googleId: profile.id, accountType: ACCOUNT_TYPE.GOOGLE },
                            include: { role: true }, // ✅ để đảm bảo user.role luôn có
                        });
                    }

                    return done(null, user);
                } catch (e) {
                    return done(e as any, false);
                }
            }
        )
    );

    console.log("[passport.google] GoogleStrategy registered");
}

export default passport;
