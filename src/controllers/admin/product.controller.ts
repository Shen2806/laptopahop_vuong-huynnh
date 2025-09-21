import { Request, Response } from "express";
import { createProduct, deleteProductById, getProductById, updateProductById } from "services/admin/product.service";
import { ProductSchema, TProductSchema } from "src/validation/product.schema";

const getAdminCreateProductPage = async (req: Request, res: Response) => {
    const errors: string[] = [];
    const oldData = {
        name: "",
        price: "",
        detailDesc: "",
        shortDesc: "",
        quantity: "",
        factory: "",
        target: ""
    };
    return res.render("admin/product/create.ejs", {
        errors,
        oldData,
    });
};

const postAdminCreateProduct = async (req: Request, res: Response) => {
    const validate = ProductSchema.safeParse(req.body);

    if (!validate.success) {
        const errors = validate.error.issues.map(item => `${item.message} (${item.path[0]})`);
        return res.render("admin/product/create.ejs", {
            errors,
            oldData: req.body,
        });
    }

    const data: TProductSchema = validate.data;
    const imageUpload = req?.file?.filename ?? null;

    await createProduct({
        name: data.name,
        price: data.price,
        detailDesc: data.detailDesc,
        shortDesc: data.shortDesc,
        factory: data.factory,
        quantity: data.quantity,
        target: data.target,
        imageUpload,
    });

    return res.redirect("/admin/product");
};

const postDeleteProduct = async (req: Request, res: Response) => {
    const { id } = req.params;
    // Logic to delete the product by id
    await deleteProductById(+id); // Assuming you have a service function for this
    return res.redirect("/admin/product");
}

const getViewProduct = async (req: Request, res: Response) => {
    const { id } = req.params;

    // get product id 
    const product = await getProductById(+id);

    const factoryOptions = [
        { name: "Apple (MacBook)", value: "APPLE" },
        { name: "Asus", value: "ASUS" },
        { name: "Lenovo", value: "LENOVO" },
        { name: "Dell", value: "DELL" },
        { name: "LG", value: "LG" },
        { name: "Hp", value: "HP" },// mới cập nhật
        { name: "Msi", value: "MSI" },// mới cập nhật
        { name: "Gigabyte", value: "GIGABYTE" },// mới cập nhật
        { name: "Alienware", value: "ALIENWARE" },// mới cập nhật
    ];

    const targetOptions = [
        { name: "Gaming", value: "GAMING" },
        { name: "Sinh viên - Văn phòng", value: "SINHVIEN-VANPHONG" },
        { name: "Thiết kế đồ họa", value: "THIET-KE-DO-HOA" },
        { name: "Mỏng nhẹ", value: "MONG-NHE" },
        { name: "Doanh nhân", value: "DOANH-NHAN" },
    ];
    return res.render("admin/product/detail.ejs", {
        product,
        factoryOptions,
        targetOptions
    })
    // return res.render("admin/product/view.ejs", { productId: id });
}

const postUpdateProduct = async (req: Request, res: Response) => {
    const {
        id,
        name,
        price,
        detailDesc,
        shortDesc,
        factory,
        quantity,
        target
    } = req.body as TProductSchema;

    const image = req?.file?.filename ?? null;
    await updateProductById({
        id: Number(id),
        name,
        price: Number(price),
        detailDesc,
        shortDesc,
        factory,
        quantity: Number(quantity),
        target,
        ...(image && { image }) //nếu có image thì mới gán
    }
    )
    return res.redirect("/admin/product");
}


export { getAdminCreateProductPage, postAdminCreateProduct, postDeleteProduct, getViewProduct, postUpdateProduct };
