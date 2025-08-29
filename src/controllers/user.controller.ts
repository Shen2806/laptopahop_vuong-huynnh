import { Request, Response } from 'express';
import { countTotalProductClientPages, getProducts } from 'services/client/item.service';
import { getProductWithFilter, getSortIncProduct, userFilter } from 'services/client/product.filter';
import { getAllRoles, getAllUsers, getUserById, handleCreateUser, handleDeleteUser, updateUserById } from 'services/user.service';

const getHomePage = async (req: Request, res: Response) => {
    const { page } = req.query;

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    const totalPages = await countTotalProductClientPages(8);
    const products = await getProducts(currentPage, 8);
    return res.render("client/home/show.ejs", {
        products,
        totalPages: +totalPages,
        page: +currentPage
    });
}
const getCreateUserPage = async (req: Request, res: Response) => {
    const roles = await getAllRoles();
    return res.render("admin/user/create.ejs", {
        roles: roles
    });
}
const postCreateUser = async (req: Request, res: Response) => {
    const { fullName, username, phone, role, address } = req.body;
    const file = req.file;
    const avatar = file?.filename ?? '';
    // handle create user logic
    await handleCreateUser(fullName, username, address, phone, avatar, role);
    return res.redirect("/admin/user");
}

const postDeleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle delete user logic
    await handleDeleteUser(Number(id));
    // redirect to home page
    return res.redirect("/admin/user");
}
const getViewUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    // handle view user logic
    const user = await getUserById(Number(id));
    return res.render("admin/user/detail.ejs", {
        id: id,
        user: user,
        roles: await getAllRoles()
    });

}

const postUpdateUser = async (req: Request, res: Response) => {
    const { id, fullName, phone, role, address } = req.body;
    const file = req.file;
    const avatar = file?.filename ?? '';

    // gọi service
    await updateUserById(
        Number(id),
        fullName,
        phone,
        Number(role),   // role phải là số
        address,
        avatar
    );

    return res.redirect("/admin/user");
};

const getProductFilterPage = async (req: Request, res: Response) => {
    const { page, factory = "", target = "", price = "", sort = "", } = req.query as {
        page?: string,
        factory: string,
        target: string,
        price: string,
        sort: string
    };

    let currentPage = page ? +page : 1;
    if (currentPage <= 0) currentPage = 1;
    // const totalPages = await countTotalProductClientPages(6);
    // const products = await getProducts(currentPage, 6);
    const data = await getProductWithFilter(currentPage, 6, factory, target, price, sort)
    return res.render("product/filter.ejs", {
        products: data.products,
        totalPages: +data.totalPages,
        page: +currentPage

    });


    // const { username } = req.query;
    // const users = await userFilter(username as string)

    // const { minPrice, maxPrice, factory, price, sort } = req.query

    // const products = await getMinPrice(+minPrice);
    // const products = await getMaxPrice(+maxPrice);
    // const products = await getFactory(factory as string);
    // const products = await getManyFactory((factory as string).split(","));
    // const products = await getAboutPrice(10000000, 15000000);
    // const products = await getRangePrice();
    // const products = await getSortIncProduct();
    // res.status(200).json({
    //     data: products
    // })
}
export { getHomePage, getCreateUserPage, postCreateUser, postDeleteUser, getViewUser, postUpdateUser, getProductFilterPage };