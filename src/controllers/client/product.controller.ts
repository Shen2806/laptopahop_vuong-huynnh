import { Request, Response } from "express";
import { addProductToCard, getProductById } from "services/client/item.service";

const getProductPage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await getProductById(+id);
    return res.render("product/detail", {
        product
    });
}

const postAddProductToCart = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    if (user) {
        await addProductToCard(1, +id, user);
    } else {
        // not login
        return res.redirect("/login");
    }

    return res.redirect("/")
}
export { getProductPage, postAddProductToCart };