import { Request, Response } from "express";
import { prisma } from "config/client";

// Lấy danh sách blog
const getAdminBlogPage = async (req: Request, res: Response) => {
    const blogs = await prisma.blog.findMany({
        orderBy: { createdAt: "desc" }
    });
    return res.render("admin/blog/list.ejs", { blogs });
};

// Form tạo blog
const getAdminCreateBlogPage = async (req: Request, res: Response) => {
    return res.render("admin/blog/create");
};

// Xử lý tạo blog
const postAdminCreateBlog = async (req: Request, res: Response) => {
    const { title, content, author, published } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, "-");
    let thumbnail = req.file ? `/images/blog/${req.file.filename}` : null;

    await prisma.blog.create({
        data: { title, slug, content, author, thumbnail, published: published === "true" }
    });

    return res.redirect("/admin/blog");
};

// Form chỉnh sửa blog
const getAdminEditBlogPage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const blog = await prisma.blog.findUnique({ where: { id: +id } });
    if (!blog) return res.status(404).send("Blog not found");
    return res.render("admin/blog/edit", { blog });
};

// Xử lý cập nhật blog
const postAdminUpdateBlog = async (req: Request, res: Response) => {
    const { id } = req.body;
    const { title, content, author, published } = req.body;
    let thumbnail = req.file ? `/images/blog/${req.file.filename}` : undefined;

    await prisma.blog.update({
        where: { id: +id },
        data: { title, content, author, published: published === "true", ...(thumbnail && { thumbnail }) }
    });

    return res.redirect("/admin/blog");
};

// Xóa blog
const postDeleteBlog = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.blog.delete({ where: { id: +id } });
    return res.redirect("/admin/blog");
};

export {
    getAdminBlogPage,
    getAdminCreateBlogPage,
    postAdminCreateBlog,
    getAdminEditBlogPage,
    postAdminUpdateBlog,
    postDeleteBlog
};
