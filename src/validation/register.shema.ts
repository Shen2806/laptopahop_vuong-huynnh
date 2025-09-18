import { isEmailExist } from "services/client/auth.service";
import { z } from "zod";

const passwordShema = z
    .string()
    .min(3, { message: "Mật khẩu phải có ít nhất 3 ký tự !" })
    .max(32, { message: "Mật khẩu không được vượt quá 32 ký tự !" })
    .refine((password) => /[A-Z]/.test(password), {
        message: "Mật khẩu phải có ít nhất 1 chữ cái viết hoa !"
    })
    .refine((password) => /[a-z]/.test(password), {
        message: "Mật khẩu phải có ít nhất 1 chữ cái viết thường !"
    })
    .refine((password) => /[0-9]/.test(password), {
        message: "Mật khẩu phải có ít nhất 1 chữ số !"
    })
    .refine((password) => /[!@#$%^&*(),.?":{}|<>]/.test(password), {
        message: "Mật khẩu phải có ít nhất 1 ký tự đặc biệt !"
    });



const emailShema =
    z.string().email("Email này không đúng định dạng !")
        .refine(async (email) => {
            const existingUser = await isEmailExist(email);
            return !existingUser;
        }, {
            message: "Email này đã được sử dụng !",
            path: ["email"]
        });
export const RegisterSchema = z.object({
    fullName: z.string().trim().min(1, { message: "Tên không được để trống !" }),
    email: emailShema,
    password: passwordShema,
    confirmPassword: z.string(),
})
    .refine((data) => data.password === data.confirmPassword, {
        message: "Mật khẩu xác nhận không khớp !",
        path: ["confirmPassword"]
    });
export type TRegisterSchema = z.infer<typeof RegisterSchema>;
