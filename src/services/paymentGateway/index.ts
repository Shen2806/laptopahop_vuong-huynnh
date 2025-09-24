import { PaymentGateway } from './types';
import { VnpayProvider } from './vnpay';

// export function paymentGateway(): PaymentGateway {
//     const tmn = process.env.VNP_TMN || '';
//     const hash = process.env.VNP_HASH || '';
//     const url = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
//     const returnUrl = process.env.VNP_RETURN_URL || '';
//     const ipnUrl = process.env.VNP_IPN_URL || '';
//     return new VnpayProvider({ tmnCode: tmn, hashSecret: hash, vnpUrl: url, returnUrl, ipnUrl });
// }
export function paymentGateway(): PaymentGateway {
    const tmn = (process.env.VNP_TMN || '').trim();
    const hash = (process.env.VNP_HASH || '').trim(); // <-- trim để loại bỏ khoảng trắng thừa
    const url = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl = process.env.VNP_RETURN_URL || '';
    const ipnUrl = process.env.VNP_IPN_URL || '';
    return new VnpayProvider({ tmnCode: tmn, hashSecret: hash, vnpUrl: url, returnUrl, ipnUrl });
}
