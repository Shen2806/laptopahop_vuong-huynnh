import type { Coupon } from '@prisma/client';

export function applyCouponToOrder(input: {
    coupon: Coupon | null,
    subTotal: number,
    shippingFee: number
}) {
    const { coupon, subTotal, shippingFee } = input;
    let orderDiscount = 0;
    let shippingDiscount = 0;

    if (!coupon) return { orderDiscount, shippingDiscount };

    const now = new Date();
    if (!coupon.isActive || (coupon.expiryDate && coupon.expiryDate < now)) {
        return { orderDiscount, shippingDiscount };
    }
    if ((coupon.minOrder ?? 0) > subTotal) {
        return { orderDiscount, shippingDiscount };
    }

    if (coupon.freeShip) {
        const cap = coupon.shipDiscountCap ?? shippingFee;
        shippingDiscount = Math.min(shippingFee, cap);
        return { orderDiscount, shippingDiscount };
    }

    // giảm % trên HÀNG HÓA
    const percent = Number(coupon.discount || 0);
    if (percent > 0) {
        orderDiscount = Math.floor(subTotal * percent / 100);
    }
    return { orderDiscount, shippingDiscount };
}
