import { Request, Response } from "express";
import { prisma } from "config/client";
import { getIO } from "src/socket";

// ===== Common types/labels =====
type OrderStatus =
    | "PENDING"
    | "CONFIRMED"
    | "SHIPPING"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "CANCELED";

export const STATUS_LABEL_VI: Record<OrderStatus, string> = {
    PENDING: "Chờ xử lý",
    CONFIRMED: "Đã xác nhận đơn",
    SHIPPING: "Đang vận chuyển",
    OUT_FOR_DELIVERY: "Đang giao hàng",
    DELIVERED: "Đã giao hàng",
    CANCELED: "Đã hủy",
};

const PIPELINE: OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "SHIPPING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
];

// ===== Helpers =====
function isAdmin(role?: string) {
    return role === "ADMIN";
}
function isOpsManager(role?: string) {
    return role === "OPS_MANAGER";
}
function isOpsStaff(role?: string) {
    return role === "OPS_STAFF";
}

function nextInPipeline(cur: OrderStatus | string): OrderStatus | null {
    const idx = PIPELINE.indexOf(cur as OrderStatus);
    if (idx >= 0 && idx < PIPELINE.length - 1) return PIPELINE[idx + 1];
    return null;
}

// emit tới đúng room user-<id> (khớp socket.ts)
function emitToUser(userId: number, event: string, payload: any) {
    try {
        const io = getIO();
        io.to(`user-${userId}`).emit(event, payload);
    } catch {
        // nuốt lỗi để không ảnh hưởng flow
    }
}

// load staffId theo username (để lọc assignedShipperId cho OPS_STAFF)
async function getStaffIdOfRequest(req: any): Promise<number | null> {
    const username = req?.user?.username;
    if (!username) return null;
    const s = await prisma.staff.findFirst({
        where: { username },
        select: { id: true },
    });
    return s?.id ?? null;
}

// cho UI: allowedNext theo vai trò
function allowedNextByRole(
    roleName: string | undefined,
    current: OrderStatus,
    opts?: { assignedShipperId?: number | null; meStaffId?: number | null }
): OrderStatus[] {
    if (isOpsManager(roleName)) {
        if (current === "PENDING") return ["CONFIRMED"];
        if (current === "CONFIRMED") return ["SHIPPING"];
        return [];
    }
    if (isOpsStaff(roleName)) {
        if (current === "OUT_FOR_DELIVERY" && opts?.assignedShipperId && opts.meStaffId && opts.assignedShipperId === opts.meStaffId) {
            return ["DELIVERED"];
        }
        return [];
    }
    // ADMIN: cho phép đi bước kế tiếp trong pipeline (nếu còn)
    const nxt = nextInPipeline(current);
    return nxt ? [nxt] : [];
}

// ====== LIST /admin/order ======
export const getOrderList = async (req: any, res: Response) => {
    const roleName: string | undefined = req.user?.role?.name;
    const meStaffId = isOpsStaff(roleName) ? await getStaffIdOfRequest(req) : null;

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const pageSize = 12;
    const skip = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim();
    const auth = {
        roleName,
        isAdmin: isAdmin(roleName),
        isOpsManager: isOpsManager(roleName),
        isOpsStaff: isOpsStaff(roleName),
        meStaffId,
    };
    const where: any = {};
    if (isOpsStaff(roleName) && meStaffId) {
        where.assignedShipperId = meStaffId; // OPS_STAFF chỉ thấy đơn của mình
    }

    if (search) {
        const numericId = Number(search);
        where.OR = [
            ...(Number.isFinite(numericId) ? [{ id: numericId }] : []),
            { status: { contains: search.toUpperCase() } },
            { paymentMethod: { contains: search, mode: "insensitive" } },
            { paymentStatus: { contains: search, mode: "insensitive" } },
            { user: { fullName: { contains: search, mode: "insensitive" } } },
            { user: { username: { contains: search, mode: "insensitive" } } },
        ];
    }

    const [rows, total] = await Promise.all([
        prisma.order.findMany({
            where,
            include: { user: true },
            orderBy: { id: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.order.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.render("admin/order/show.ejs", {
        orders: rows,
        page,
        totalPages,
        search,
        auth
    });
};

// ====== DETAIL /admin/order/:id ======
export const getOrderDetail = async (req: any, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).send("Mã đơn không hợp lệ");

    const roleName: string | undefined = req.user?.role?.name;
    const meStaffId = isOpsStaff(roleName) ? await getStaffIdOfRequest(req) : null;
    const auth = {
        roleName,
        isAdmin: isAdmin(roleName),
        isOpsManager: isOpsManager(roleName),
        isOpsStaff: isOpsStaff(roleName),
        meStaffId,
    };
    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            user: true,
            orderDetails: { include: { product: true } },
            province: true,
            district: true,
            ward: true,
            assignedShipper: { select: { id: true, fullName: true, phone: true } } as any,
        },
    });
    if (!order) return res.status(404).send("Không tìm thấy đơn hàng.");

    // Nếu là OPS_STAFF, chặn xem đơn không phải của mình
    if (isOpsStaff(roleName) && meStaffId && order.assignedShipperId !== meStaffId) {
        return res.status(403).send("Bạn không có quyền xem đơn này.");
    }

    // format ngày giờ
    const formattedCreatedAtVN = new Date(order.createdAt).toLocaleString("vi-VN");

    // địa chỉ
    const addressDisplay =
        [
            (order as any).receiverStreet,
            order.ward?.name,
            order.district?.name,
            order.province?.name,
        ]
            .filter(Boolean)
            .join(", ") || (order as any).receiverAddress || "—";

    const allowedNext = allowedNextByRole(roleName, order.status as OrderStatus, {
        assignedShipperId: order.assignedShipperId ?? null,
        meStaffId,
    });

    // Khi OPS_MANAGER và trạng thái SHIPPING -> load danh sách shipper để bàn giao
    const shippers =
        isOpsManager(roleName) && order.status === "SHIPPING"
            ? await prisma.staff.findMany({
                where: { status: "ACTIVE", role: { name: "OPS_STAFF" } },
                select: { id: true, fullName: true, phone: true },
                orderBy: { fullName: "asc" },
            })
            : [];

    return res.render("admin/order/detail.ejs", {
        order,
        orderDetails: order.orderDetails,
        allowedNext,
        STATUS_LABEL_VI,
        formattedCreatedAtVN,
        addressDisplay,
        auth,
        shippers, // view có thể dùng để hiển thị form bàn giao
    });
};

// ====== UPDATE STATUS (vai trò ràng buộc theo allowedNextByRole) ======
export const postUpdateOrderStatus = async (req: any, res: Response) => {
    const orderId = Number(req.params.id);
    const nextStatus = String(req.body.status || "").toUpperCase() as OrderStatus;
    if (!Number.isFinite(orderId)) return res.status(400).send("Mã đơn không hợp lệ");

    const roleName: string | undefined = req.user?.role?.name;
    const meStaffId = isOpsStaff(roleName) ? await getStaffIdOfRequest(req) : null;

    const cur = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true, assignedShipperId: true },
    });
    if (!cur) return res.status(404).send("Không tìm thấy đơn hàng.");

    // kiểm tra luồng cho phép
    const allow = allowedNextByRole(roleName, cur.status as OrderStatus, {
        assignedShipperId: cur.assignedShipperId ?? null,
        meStaffId,
    });
    if (!allow.includes(nextStatus)) {
        return res.status(403).send("Trạng thái không hợp lệ với quyền hiện tại.");
    }

    const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
        select: { id: true, userId: true },
    });

    const msg = `Đơn #${updated.id} cập nhật: ${STATUS_LABEL_VI[nextStatus] || nextStatus}`;

    // 🔔 Emit đúng event
    if (nextStatus === "CONFIRMED") {
        emitToUser(updated.userId, "order-confirmed", { orderId, status: nextStatus, message: msg });
    } else if (nextStatus === "CANCELED") {
        emitToUser(updated.userId, "order-canceled", { orderId, status: nextStatus, message: msg });
    } else {
        emitToUser(updated.userId, "order-updated", { orderId, status: nextStatus, message: msg });
    }

    return res.redirect(`/admin/order/${orderId}`);
};

// ====== CANCEL ======
export const postCancelOrder = async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    const reason = String((req.body as any).cancelReason || "").trim();

    const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: "CANCELED", cancelReason: reason },
        select: { id: true, userId: true },
    });

    const msg = `Đơn #${updated.id} đã hủy${reason ? `: ${reason}` : ""}`;
    emitToUser(updated.userId, "order-canceled", {
        orderId,
        status: "CANCELED",
        message: msg,
    });

    return res.redirect(`/admin/order/${orderId}`);
};

// ====== ASSIGN SHIPPER (chỉ khi đang SHIPPING) -> OUT_FOR_DELIVERY ======
export const postAssignShipper = async (req: any, res: Response) => {
    const orderId = Number(req.params.id);
    const shipperId = Number(req.body.shipperId);
    const roleName: string | undefined = req.user?.role?.name;

    if (!isOpsManager(roleName) && !isAdmin(roleName)) {
        return res.status(403).send("Bạn không có quyền bàn giao vận chuyển.");
    }
    if (!Number.isFinite(orderId) || !Number.isFinite(shipperId)) {
        return res.status(400).send("Thiếu thông tin đơn/nhân viên giao hàng.");
    }

    const cur = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true },
    });
    if (!cur) return res.status(404).send("Không tìm thấy đơn hàng.");

    if (cur.status !== "SHIPPING") {
        return res.status(400).send("Hãy chuyển đơn sang 'Đang vận chuyển' trước khi bàn giao.");
    }

    // lấy thông tin shipper
    const staff = await prisma.staff.findUnique({
        where: { id: shipperId },
        select: { id: true, fullName: true, phone: true },
    });
    if (!staff) return res.status(404).send("Không tìm thấy shipper.");

    const updated = await prisma.order.update({
        where: { id: orderId },
        data: {
            status: "OUT_FOR_DELIVERY",
            assignedShipperId: staff.id,
            shipperNameCache: staff.fullName,
            shipperPhoneCache: staff.phone ?? null,
        },
        select: { id: true, userId: true },
    });

    // tạo notification DB (nếu bạn đang dùng)
    try {
        await prisma.notification.create({
            data: {
                userId: updated.userId,
                message: `Đơn #${updated.id} đang giao bởi ${staff.fullName}${staff.phone ? " - SĐT: " + staff.phone : ""}`,
            },
        });
    } catch { }

    // 🔔 Emit chuông
    const msg = `Đơn #${updated.id} đang giao bởi ${staff.fullName}`;
    emitToUser(updated.userId, "order-updated", {
        orderId: updated.id,
        status: "OUT_FOR_DELIVERY",
        message: msg,
    });

    return res.redirect(`/admin/order/${orderId}`);
};

// ====== OPS_STAFF MARK DELIVERED (OUT_FOR_DELIVERY -> DELIVERED) ======
export const postMarkDelivered = async (req: any, res: Response) => {
    const orderId = Number(req.params.id);
    const roleName: string | undefined = req.user?.role?.name;
    const meStaffId = isOpsStaff(roleName) ? await getStaffIdOfRequest(req) : null;

    const cur = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, status: true, assignedShipperId: true },
    });
    if (!cur) return res.status(404).send("Không tìm thấy đơn hàng.");

    if (!isOpsStaff(roleName) || !meStaffId || cur.assignedShipperId !== meStaffId) {
        return res.status(403).send("Bạn không có quyền xác nhận giao đơn này.");
    }
    if (cur.status !== "OUT_FOR_DELIVERY") {
        return res.status(400).send("Chỉ xác nhận giao từ trạng thái 'Đang giao hàng'.");
    }

    const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: "DELIVERED" },
        select: { id: true, userId: true },
    });

    // 🔔 Emit chuông
    const msg = `Đơn #${updated.id} đã giao hàng thành công`;
    emitToUser(updated.userId, "order-updated", {
        orderId,
        status: "DELIVERED",
        message: msg,
    });

    return res.redirect(`/admin/order/${orderId}`);
};
