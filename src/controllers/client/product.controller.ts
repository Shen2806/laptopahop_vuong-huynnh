import { prisma } from "config/client";
import { Request, Response } from "express";
import { addProductToCard, getProductById, getProductInCart } from "services/client/item.service";

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
// const getCartPage = async (req: Request, res: Response) => {
//     const user = req.user;
//     if (!user) return res.redirect("/login");

//     return res.render("product/cart.ejs",
//         {
//             cart
//         }
//     )
// }
const getCartPage = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.redirect("/login");

    // Lấy cart từ DB
    const cart = await prisma.cart.findUnique({
        where: { userId: user.id },
        include: { cartDetails: { include: { product: true } } } // lấy luôn sản phẩm
    });
    const cartDetails = await getProductInCart(+user.id)
    const totalPrice = cartDetails?.map(item => +item.price * +item.quantity)?.reduce((a, b) => a + b, 0)
    return res.render("product/cart", {
        cart, cartDetails, totalPrice
    });
}

export { getProductPage, postAddProductToCart, getCartPage };