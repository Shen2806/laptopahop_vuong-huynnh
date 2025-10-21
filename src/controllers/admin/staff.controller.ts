import { Request, Response } from "express";
import { prisma } from "config/client";
import {
    getStaffPage,
    getStaffById,
    createStaff,
    updateStaff,
    deleteStaff,
} from "services/admin/staff.service";

const STAFF_ROLE_NAMES = [
    "ADMIN", "OPS_MANAGER", "OPS_STAFF", "SALES_SUPPORT", "MARKETING_CONTENT",
] as const;

// Gom quyền theo nhóm để render UI
const PERM_GROUPS: Record<string, string[]> = {
    "Nhân sự & Role": ["staff.view", "staff.create", "staff.update", "staff.delete", "role.manage"],
    "Dashboard": ["dashboard.view"],
    "Khách hàng": ["customer.view", "customer.update"],
    "Sản phẩm": ["product.view", "product.create", "product.update", "product.delete"],
    "Kho": ["inventory.view", "inventory.adjust", "inventory.import", "inventory.export", "inventory.stocktake"],
    "Đơn hàng & Fulfillment": [
        "order.view", "order.create", "order.update", "order.refund", "order.fulfill",
        "fulfillment.pick", "fulfillment.pack", "fulfillment.label", "fulfillment.handover",
    ],
    "Vận đơn & Trả hàng": [
        "shipment.view", "shipment.create", "shipment.assign", "shipment.update_status",
        "returns.receive", "returns.inspect",
    ],
    "Giao hàng": ["delivery.view_assigned", "delivery.update_status", "delivery.pod_upload", "delivery.returns_pickup"],
    "Marketing": ["promo.view", "promo.create", "promo.update", "promo.delete",
        "coupon.view", "coupon.create", "coupon.update", "coupon.delete"],
    "Nội dung": ["blog.view", "blog.create", "blog.update", "blog.delete"],
    "Hỗ trợ": ["chat.view", "chat.reply", "qa.view", "qa.moderate"],
};

// role → danh sách quyền mặc định (dùng đúng quan hệ rolePermissions)
async function getRolePermMap() {
    const roles = await prisma.role.findMany({
        where: { name: { in: STAFF_ROLE_NAMES as unknown as string[] } },
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { id: "asc" },
    });
    const map: Record<string, string[]> = {};
    for (const r of roles) {
        map[r.name] = (r.rolePermissions || []).map(rp => rp.permission.name);
    }
    return map;
}

// GET /admin/staff
const getAdminStaffPage = async (req: Request, res: Response) => {
    const { page = "1", search = "" } = req.query as any;
    let currentPage = parseInt(String(page), 10);
    if (!Number.isFinite(currentPage) || currentPage < 1) currentPage = 1;

    const pageSize = 8;
    const { rows, total } = await getStaffPage(currentPage, pageSize, String(search || ""));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const users = rows.map((s) => ({
        id: s.id, fullName: s.fullName, username: s.username, address: s.address,
        phone: s.phone, avatar: s.avatar, role: s.role,
    }));

    return res.render("admin/staff/show.ejs", {
        users, page: currentPage, totalPages, search: String(search || ""),
    });
};

// Từ điển tên nhóm (nếu cần)
const VN_GROUP: Record<string, string> = {
    dashboard: "Bảng điều khiển",
    staff: "Nhân viên",
    customer: "Khách hàng",
    product: "Sản phẩm",
    inventory: "Tồn kho",
    order: "Đơn hàng",
    blog: "Blog",
    promo: "Khuyến mãi",
    coupon: "Mã giảm giá",
    chat: "Tin nhắn",
    qa: "Q&A",
    role: "Phân quyền",
};

// GET /admin/create-staff
const getCreateStaffPage = async (_req: any, res: any) => {
    const roles = await prisma.role.findMany({
        where: { name: { in: ["ADMIN", "OPS_MANAGER", "OPS_STAFF", "SALES_SUPPORT", "MARKETING_CONTENT"] } },
        orderBy: { id: "asc" },
    });

    // Lấy toàn bộ permission để dựng UI nhóm
    const allPerms = await prisma.permission.findMany({ orderBy: { name: "asc" } });

    const permGroups: Record<string, string[]> = {};
    for (const p of allPerms) {
        const [resKey] = p.name.split(".");
        const key = resKey.toLowerCase();
        if (!permGroups[key]) permGroups[key] = [];
        permGroups[key].push(p.name);
    }

    // Map role → quyền mặc định (rolePermissions)
    const roleRows = await prisma.role.findMany({
        include: { rolePermissions: { include: { permission: true } } },
        where: { id: { in: roles.map(r => r.id) } },
    });
    const rolePermMap: Record<string, string[]> = {};
    for (const r of roleRows) {
        rolePermMap[r.name] = r.rolePermissions.map(rp => rp.permission.name);
    }

    return res.render("admin/staff/create.ejs", {
        roles,
        permGroups,     // { resource: [perm, ...] }
        rolePermMap,    // { ROLE_NAME: [perm, ...] }
        VN_GROUP,
    });
};

// helper: chuẩn hoá array từ form (permsAllow[]/permsDeny[])
function pickArray(body: any, key: string): string[] {
    if (Array.isArray(body[key])) return body[key];
    if (Array.isArray(body[`${key}[]`])) return body[`${key}[]`];
    if (body[key]) return [body[key]];
    if (body[`${key}[]`]) return [body[`${key}[]`]];
    return [];
}

// POST /admin/handle-create-staff
const postCreateStaff = async (req: Request, res: Response) => {
    const { fullName, username, phone, role, address, status, password } = req.body;
    const file = (req as any).file;
    const avatar = file?.filename ?? "";

    const roleIdNum = Number(role);
    const theRole = await prisma.role.findUnique({ where: { id: roleIdNum } });
    if (!theRole || !STAFF_ROLE_NAMES.includes(theRole.name as any)) {
        return res.status(400).send("Role không hợp lệ cho nhân viên.");
    }

    const permsAllow = pickArray(req.body, "permsAllow");
    const permsDeny = pickArray(req.body, "permsDeny");

    await createStaff({
        fullName: String(fullName).trim(),
        username: String(username).trim(),
        phone: phone ? String(phone).trim() : undefined,
        roleId: roleIdNum,
        address: address ? String(address).trim() : undefined,
        avatar,
        status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        password,
        permsAllow, permsDeny,
    });

    return res.redirect("/admin/staff");
};

// GET /admin/view-staff/:id
const getViewStaff = async (req: Request, res: Response) => {
    const staffId = Number(req.params.id);
    const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        include: {
            role: true,
            staffPermissions: { include: { permission: true } }, // ✅ đúng tên quan hệ
        },
    });
    if (!staff) return res.status(404).send("Không tìm thấy nhân viên.");

    const roles = await prisma.role.findMany({
        where: { name: { in: STAFF_ROLE_NAMES as unknown as string[] } },
        orderBy: { id: "asc" },
    });
    const rolePermMap = await getRolePermMap();

    const customAllow = (staff.staffPermissions || [])
        .filter(sp => sp.effect === "ALLOW")
        .map(sp => sp.permission.name);
    const customDeny = (staff.staffPermissions || [])
        .filter(sp => sp.effect === "DENY")
        .map(sp => sp.permission.name);

    return res.render("admin/staff/detail.ejs", {
        id: staffId,
        user: {
            id: staff.id,
            fullName: staff.fullName,
            username: staff.username,
            address: staff.address,
            phone: staff.phone,
            avatar: staff.avatar,
            roleId: staff.roleId,
            role: staff.role?.name,
        },
        roles,
        permGroups: PERM_GROUPS,
        rolePermMap: JSON.stringify(rolePermMap),
        customAllow: JSON.stringify(customAllow),
        customDeny: JSON.stringify(customDeny),
    });
};

// POST /admin/update-staff
const postUpdateStaff = async (req: Request, res: Response) => {
    const staffId = Number(req.body.id);
    const roleIdNum = Number(req.body.role);
    const theRole = await prisma.role.findUnique({ where: { id: roleIdNum } });
    if (!theRole || !STAFF_ROLE_NAMES.includes(theRole.name as any)) {
        return res.status(400).send("Role không hợp lệ cho nhân viên.");
    }

    const file = (req as any).file;
    const avatar = file?.filename ?? "";

    const permsAllow = pickArray(req.body, "permsAllow");
    const permsDeny = pickArray(req.body, "permsDeny");

    await updateStaff(staffId, {
        fullName: String(req.body.fullName || "").trim(),
        username: req.body.username ? String(req.body.username).trim() : undefined,
        phone: req.body.phone ? String(req.body.phone).trim() : undefined,
        roleId: roleIdNum,
        address: req.body.address ? String(req.body.address).trim() : undefined,
        avatar,
        status: req.body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        password: req.body.password,
        permsAllow, permsDeny,
    });

    return res.redirect("/admin/staff");
};

// POST /admin/delete-staff/:id
const postDeleteStaff = async (req: Request, res: Response) => {
    await deleteStaff(Number(req.params.id));
    return res.redirect("/admin/staff");
};

export {
    getAdminStaffPage,
    getCreateStaffPage,
    postCreateStaff,
    getViewStaff,
    postUpdateStaff,
    postDeleteStaff,
};
