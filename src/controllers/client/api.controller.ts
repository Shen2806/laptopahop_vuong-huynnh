import { addProductToCart } from "services/client/item.service";
import { Response, Request } from "express";
import { handleDeleteUserById, handleGetAllUser, handleGetUserById, handleUpdateUserById, handleUserLogin } from "services/client/api.service";
import { RegisterSchema, TRegisterSchema } from "src/validation/register.shema";
import { registerNewUser } from "services/client/auth.service";
import getConnection from "config/database";

const postAddProductToCartAPI = async (req: Request, res: Response) => {
    const { quantity, productId } = req.body;
    const user = req.user;

    const currentSum = req?.user?.sumCart ?? 0;
    const newSum = currentSum + (+quantity);

    await addProductToCart(+quantity, +productId, user);

    res.status(200).json({
        data: newSum
    })

}
const getAllUsersAPI = async (req: Request, res: Response) => {
    const users = await handleGetAllUser()
    const user = req.user;
    console.log(user)
    res.status(200).json({
        data: users
    })
}
const getUsersByIdAPI = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = await handleGetUserById(+id)

    res.status(200).json({
        data: user
    })
}
const createUserAPI = async (req: Request, res: Response) => {
    const { fullName, email, password } = req.body as TRegisterSchema;

    const validate = await RegisterSchema.safeParseAsync(req.body);
    if (!validate.success) {
        const errorsZod = validate.error.issues;
        const errors = errorsZod?.map(item => `${item.message} (${item.path[0]}) `);

        res.status(400).json({
            error: errors
        })
        return;
    }
    //success
    await registerNewUser(fullName, email, password);
    res.status(201).json({
        data: "Tạo mới tài khoản thành công !"
    })
    return;
}
const updateUserByIdAPI = async (req: Request, res: Response) => {
    const { fullName, address, phone } = req.body;
    const { id } = req.params;

    //success
    await handleUpdateUserById(+id, fullName, address, phone);
    res.status(200).json({
        data: "Cập nhật người dùng thành công !"
    })
    return;
}
const deleteUserByIdAPI = async (req: Request, res: Response) => {
    const { id } = req.params;

    //success
    await handleDeleteUserById(+id);
    res.status(200).json({
        data: "Xóa người dùng thành công !"
    })
    return;
}
const loginAPI = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const access_token = await handleUserLogin(username, password)
        res.status(200).json({

            access_token
        })

    } catch (error) {
        res.status(401).json({
            data: null,
            message: error.message
        })
    }

}
const fetchAccountAPI = async (req: Request, res: Response) => {
    const user = req.user;

    res.status(200).json({
        data: {
            user
        }

    })
}






export { postAddProductToCartAPI, getAllUsersAPI, getUsersByIdAPI, createUserAPI, updateUserByIdAPI, deleteUserByIdAPI, loginAPI, fetchAccountAPI }
