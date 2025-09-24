import express from 'express';
import { prisma } from 'config/client';
import { paymentGateway } from 'src/services/paymentGateway';

const router = express.Router();

// Return URL (user browser quay lại)
router.get('/return', async (req, res) => {
    const gw = paymentGateway();
    const v = await gw.verifyCallback(req.query);

    if (v.orderId) {
        try {
            await prisma.order.update({
                where: { id: v.orderId },
                data: {
                    paymentStatus: v.status,
                    paymentRef: v.txnId,
                    paymentMethod: 'ONLINE',
                },
            });
        } catch { }
    }
    return res.redirect(`/thanks?orderId=${v.orderId || ''}`);
});

// IPN (VNPAY gọi server-to-server) – chấp nhận GET/POST
// router.all('/ipn', async (req, res) => {
//     const payload = Object.keys(req.body || {}).length ? req.body : req.query;
//     const gw = paymentGateway();
//     const v = await gw.verifyCallback(payload);

//     if (v.orderId) {
//         try {
//             await prisma.order.update({
//                 where: { id: v.orderId },
//                 data: {
//                     paymentStatus: v.status,
//                     paymentRef: v.txnId,
//                     paymentMethod: 'ONLINE',
//                 },
//             });
//         } catch { }
//     }
//     // Theo tài liệu VNPAY: 00 = nhận OK; 97 = lỗi xác thực
//     return res.json({ RspCode: v.status === 'PAID' ? '00' : '97', Message: v.status });
// });
router.all('/ipn', async (req, res) => {
    const payload = Object.keys(req.body || {}).length ? req.body : req.query;
    const gw = paymentGateway();
    const v = await gw.verifyCallback(payload);

    // Chỉ cập nhật DB khi checksum hợp lệ
    if (v.valid && v.orderId) {
        try {
            await prisma.order.update({
                where: { id: v.orderId },
                data: {
                    paymentStatus: v.status,
                    paymentRef: v.txnId,
                    paymentMethod: 'ONLINE',
                },
            });
        } catch { }
    }

    // Theo tài liệu: 00 = đã nhận & xử lý (kể cả thanh toán fail),
    // 97 = Invalid Checksum => VNPAY sẽ retry
    return res.json({ RspCode: v.valid ? '00' : '97', Message: v.valid ? 'OK' : 'Invalid Checksum' });
});

export default router;
