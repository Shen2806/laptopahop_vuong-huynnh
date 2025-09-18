

import { z } from "zod";

// helper: ép về string rồi kiểm tra rỗng
const toTrimmedString = (msg: string) =>
    z.preprocess((val) => {
        if (val == null) return "";                 // undefined/null -> ""
        if (Array.isArray(val))                     // array -> ghép lại
            return val.filter(v => typeof v === "string").join(" ");
        if (typeof val === "string") return val;    // string -> giữ nguyên
        return "";                                  // kiểu khác -> coi như rỗng
    }, z.string().trim().min(1, { message: msg }));

// helper: ép về number dương
const toPositiveNumber = (msg: string) =>
    z.preprocess((val) => {
        if (val == null || val === "") return 0;
        if (typeof val === "number") return val;
        if (typeof val === "string") return Number(val.replace(/,/g, ""));
        return 0;
    }, z.number().gt(0, { message: msg }));

export const ProductSchema = z.object({
    id: z.string().optional(), // thêm id để phục vụ update
    name: toTrimmedString("Tên không được để trống !"),

    price: toPositiveNumber("Số tiền tối thiểu là 1"),

    detailDesc: toTrimmedString("Mô tả chi tiết không được để trống !"),

    shortDesc: toTrimmedString("Mô tả ngắn không được để trống !"), // <= hết "Invalid input"

    quantity: toPositiveNumber("Số lượng tối thiểu là 1"),

    factory: toTrimmedString("Hãng sản xuất không được để trống !"),
    target: toTrimmedString("Đối tượng sử dụng không được để trống !"),
});

export type TProductSchema = z.infer<typeof ProductSchema>;
