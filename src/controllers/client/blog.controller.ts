import { Request, Response } from "express";
import { prisma } from "config/client";

// Trang danh sách blog
const getBlogListPage = async (req: Request, res: Response) => {
    const blogs = await prisma.blog.findMany({
        where: { published: true },
        orderBy: { createdAt: "desc" }
    });
    return res.render("client/blog/list", { blogs });
};

// Trang chi tiết blog
const getBlogDetailPage = async (req: Request, res: Response) => {
    const { slug } = req.params;
    const blog = await prisma.blog.findUnique({ where: { slug } });
    if (!blog) return res.status(404).send("Bài viết không tồn tại");

    // Lấy thêm vài bài liên quan
    const related = await prisma.blog.findMany({
        where: { published: true, id: { not: blog.id } },
        take: 3,
        orderBy: { createdAt: "desc" }
    });

    return res.render("client/blog/detail", { blog, related });
};

export { getBlogListPage, getBlogDetailPage };
