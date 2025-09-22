import { prisma } from 'config/client';
import { ACCOUNT_TYPE } from 'config/constant';
import { hashPassword } from 'services/user.service';

export async function findOrCreateUserFromGoogle(params: {
    email: string; fullName?: string | null; googleId?: string | null;
}) {
    const { email, fullName, googleId } = params;

    let user = await prisma.user.findFirst({
        where: { OR: [{ username: email }, { googleId: googleId || '' }] },
        include: { role: true },
    });

    if (!user) {
        const role = await prisma.role.findUnique({ where: { name: 'USER' } });
        if (!role) throw new Error('ROLE USER missing');

        const random = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const hashed = await hashPassword(random);

        user = await prisma.user.create({
            data: {
                username: email,
                password: hashed,                // Google user không dùng password
                fullName: fullName || email,
                accountType: ACCOUNT_TYPE.GOOGLE,
                roleId: role.id,
                googleId: googleId || null,      // cần cột googleId (nullable, unique)
            },
            include: { role: true },
        });
    } else if (!user.googleId && googleId) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId, accountType: ACCOUNT_TYPE.GOOGLE },
            include: { role: true },
        });
    }

    return user;
}
