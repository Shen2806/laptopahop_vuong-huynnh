

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

// export const ProductSchema = z.object({
//     id: z.string().optional(), // thêm id để phục vụ update
//     name: toTrimmedString("Tên không được để trống !"),

//     price: toPositiveNumber("Số tiền tối thiểu là 1"),

//     detailDesc: toTrimmedString("Mô tả chi tiết không được để trống !"),

//     shortDesc: toTrimmedString("Mô tả ngắn không được để trống !"), // <= hết "Invalid input"

//     quantity: toPositiveNumber("Số lượng tối thiểu là 1"),

//     factory: toTrimmedString("Hãng sản xuất không được để trống !"),
//     target: toTrimmedString("Đối tượng sử dụng không được để trống !"),

//     // mới
//     cpu: z.string().optional().nullable(),
//     ramGB: z.coerce.number().int().positive().optional().nullable(),
//     storageGB: z.coerce.number().int().positive().optional().nullable(),
//     storageType: z.enum(["HDD", "SSD", "NVME"]).optional().nullable(),
//     screenResolution: z.enum(["FHD", "QHD", "4K"]).optional().nullable(),
//     screenSizeInch: z.coerce.number().positive().optional().nullable(),

//     // người dùng nhập dạng "TOUCH,2IN1,TB4" → mình convert sang "|TOUCH|2IN1|TB4|"
//     featureTagsRaw: z.string().optional().nullable(),
// });
// src/validation/product.schema.ts

export const ProductSchema = z.object({
    // Base
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().min(1, "Tên sản phẩm không được để trống"),
    price: z.coerce.number().int().nonnegative("Giá không hợp lệ"),
    discount: z.coerce.number().int().min(0).max(100).optional().default(0),
    detailDesc: z.string().optional().default(""),
    shortDesc: z.string().optional().default(""),
    quantity: z.coerce.number().int().nonnegative("Số lượng không hợp lệ"),
    factory: z.string().min(1, "Hãng sản xuất không được để trống"),
    target: z.string().min(1, "Mục đích không được để trống"),

    // Specs mới
    cpu: z.string().optional().nullable(),
    ramGB: z.coerce.number().int().positive().optional().nullable(),
    storageGB: z.coerce.number().int().positive().optional().nullable(),
    storageType: z.enum(["HDD", "SSD", "NVME"]).optional().nullable(),
    screenResolution: z.enum(["FHD", "QHD", "4K"]).optional().nullable(),
    screenSizeInch: z.coerce.number().positive().optional().nullable(),

    // Người dùng nhập: TOUCH,2IN1,TB4 → hệ thống lưu: |TOUCH|2IN1|TB4|
    featureTagsRaw: z.string().optional().nullable(),
});


export type TProductSchema = z.infer<typeof ProductSchema>;
