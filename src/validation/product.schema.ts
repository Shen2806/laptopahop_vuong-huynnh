import { z } from 'zod';

export const ProductSchema = z.object({
    name: z.string().trim().min(1, { message: "Tên không được để trống !" }),
    price: z.number().min(1, { message: "Giá tiền phải lớn hơn 0 !" }),
    detailDesc: z.string().trim().min(1, { message: "Mô tả chi tiết không được để trống !" }),
    shortDesc: z.string().trim().min(1, { message: "Mô tả ngắn không được để trống !" }),
    quantity: z.number().min(1, { message: "Số lượng phải lớn hơn 0 !" }),
    factory: z.string().trim().min(1, { message: "Hãng sản xuất không được để trống !" }),
    target: z.string().trim().min(1, { message: "Đối tượng sử dụng không được để trống !" }),

});

export type TProductSchema = z.infer<typeof ProductSchema>;