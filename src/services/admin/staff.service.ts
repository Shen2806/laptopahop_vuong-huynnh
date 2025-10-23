import { prisma } from "config/client";
import { hashPassword } from "services/user.service";

type StaffStatus = "ACTIVE" | "INACTIVE";

export async function getStaffPage(page: number, pageSize: number, search: string) {
    const skip = (page - 1) * pageSize;
    const where = search
        ? {
            OR: [
                { fullName: { contains: search } },
                { username: { contains: search } },
                { address: { contains: search } },
                { phone: { contains: search } },
            ],
        }
        : {};

    const [rows, total] = await Promise.all([
        prisma.staff.findMany({
            where,
            include: { role: true },
            orderBy: { id: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.staff.count({ where }),
    ]);

    return { rows, total };
}

export async function getStaffById(id: number) {
    return prisma.staff.findUnique({
        where: { id },
        include: { role: true, staffPermissions: { include: { permission: true } } },
    });
}

type CreateOrUpdateInput = {
    fullName: string;
    username: string;
    phone?: string;
    roleId: number;
    address?: string;
    avatar?: string;
    status: StaffStatus;
    password?: string;
    permsAllow?: string[];
    permsDeny?: string[];
};

export async function createStaff(input: CreateOrUpdateInput) {
    const hashed = await hashPassword(input.password || "123456");

    const staff = await prisma.staff.create({
        data: {
            fullName: input.fullName,
            username: input.username,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            password: hashed,
            status: input.status,
            roleId: input.roleId,
        },
    });

    // Đồng bộ user (đăng nhập admin-site qua bảng users)
    await prisma.user.upsert({
        where: { username: input.username },
        update: {
            fullName: input.fullName,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            roleId: input.roleId,
            password: hashed,
            accountType: "SYSTEM",
        },
        create: {
            username: input.username,
            password: hashed,
            fullName: input.fullName,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            accountType: "SYSTEM",
            roleId: input.roleId,
        },
    });

    await applyCustomPerms(staff.id, input.permsAllow || [], input.permsDeny || []);
    return staff;
}

export async function updateStaff(id: number, input: CreateOrUpdateInput) {
    const hashed = input.password ? await hashPassword(input.password) : undefined;

    const staff = await prisma.staff.update({
        where: { id },
        data: {
            fullName: input.fullName,
            username: input.username,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            ...(hashed ? { password: hashed } : {}),
            status: input.status,
            roleId: input.roleId,
        },
    });

    // Đồng bộ user theo username hiện tại
    await prisma.user.upsert({
        where: { username: staff.username },
        update: {
            fullName: input.fullName,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            roleId: input.roleId,
            ...(hashed ? { password: hashed } : {}),
            accountType: "SYSTEM",
        },
        create: {
            username: staff.username,
            password: hashed || (await hashPassword("123456")),
            fullName: input.fullName,
            phone: input.phone || null,
            address: input.address || null,
            avatar: input.avatar || null,
            accountType: "SYSTEM",
            roleId: input.roleId,
        },
    });

    await applyCustomPerms(staff.id, input.permsAllow || [], input.permsDeny || []);
    return staff;
}

export async function deleteStaff(id: number) {
    const s = await prisma.staff.findUnique({ where: { id } });
    if (!s) return;

    await prisma.staffPermission.deleteMany({ where: { staffId: id } });
    await prisma.staff.delete({ where: { id } });

    // tuỳ bạn có muốn xoá user tương ứng không:
    // await prisma.user.delete({ where: { username: s.username } }).catch(() => {});
}

async function applyCustomPerms(staffId: number, allow: string[], deny: string[]) {
    const all = Array.from(new Set([...(allow || []), ...(deny || [])]));
    // clear cũ
    await prisma.staffPermission.deleteMany({ where: { staffId } });
    if (!all.length) return;

    const perms = await prisma.permission.findMany({
        where: { name: { in: all } },
        select: { id: true, name: true },
    });
    const idByName = new Map(perms.map(p => [p.name, p.id]));

    const rows: { staffId: number; permissionId: number; effect: "ALLOW" | "DENY" }[] = [];
    for (const name of allow || []) {
        const pid = idByName.get(name);
        if (pid) rows.push({ staffId, permissionId: pid, effect: "ALLOW" });
    }
    for (const name of deny || []) {
        const pid = idByName.get(name);
        if (pid) rows.push({ staffId, permissionId: pid, effect: "DENY" });
    }
    if (rows.length) {
        await prisma.staffPermission.createMany({ data: rows, skipDuplicates: true });
    }

}

export async function assignShipperToOrder(orderId: number, shipperId: number) {
    // Lấy thông tin staff (người giao)
    const staff = await prisma.staff.findUnique({
        where: { id: shipperId },
        select: { id: true, fullName: true, phone: true }
    });
    if (!staff) throw new Error("Không tìm thấy shipper");

    // Cập nhật đơn & đẩy sang OUT_FOR_DELIVERY
    const order = await prisma.order.update({
        where: { id: orderId },
        data: {
            status: 'OUT_FOR_DELIVERY',
            assignedShipperId: staff.id,
            shipperNameCache: staff.fullName,
            shipperPhoneCache: staff.phone ?? null
        },
        select: { id: true, userId: true }
    });

    // Thông báo cho user (tuỳ chọn)
    await prisma.notification.create({
        data: {
            userId: order.userId,
            message: `Đơn #${order.id} đang giao bởi ${staff.fullName}${staff.phone ? ' - SĐT: ' + staff.phone : ''}`
        }
    });

    return order;
}
