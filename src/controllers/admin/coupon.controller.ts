import { prisma } from "config/client";
import { Request, Response } from "express";


// Danh sách
const getCoupons = async (req: Request, res: Response) => {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.render("admin/coupon/show", { coupons });
};

// Form tạo
const getCreateCoupon = (req: Request, res: Response) => {
    res.render("admin/coupon/create");
};

// Xử lý tạo
const postCreateCoupon = async (req: Request, res: Response) => {
    const { code, discount, expiryDate } = req.body;
    await prisma.coupon.create({
        data: {
            code,
            discount: Number(discount),
            expiryDate: new Date(expiryDate),
        },
    });
    res.redirect("/admin/coupon");
};

// Form sửa
const getEditCoupon = async (req: Request, res: Response) => {
    const coupon = await prisma.coupon.findUnique({ where: { id: Number(req.params.id) } });
    res.render("admin/coupon/edit", { coupon });
};

// Xử lý sửa
const postEditCoupon = async (req: Request, res: Response) => {
    const { code, discount, expiryDate } = req.body;
    await prisma.coupon.update({
        where: { id: Number(req.params.id) },
        data: {
            code,
            discount: Number(discount),
            expiryDate: new Date(expiryDate),
        },
    });
    res.redirect("/admin/coupon");
};

// Xóa
const deleteCoupon = async (req: Request, res: Response) => {
    await prisma.coupon.delete({ where: { id: Number(req.params.id) } });
    res.redirect("/admin/coupon");
};

export { getCoupons, getCreateCoupon, postCreateCoupon, getEditCoupon, postEditCoupon, deleteCoupon }