import crypto from 'crypto';
import qs from 'qs';
import { PaymentGateway, CreatePaymentSessionInput, VerifyResult } from './types';

type Opts = {
    tmnCode: string;
    hashSecret: string;
    vnpUrl: string;
    returnUrl?: string;
    ipnUrl?: string;
};

function sortObject(obj: Record<string, string | number | undefined>) {
    const keys = Object.keys(obj).sort();
    const out: Record<string, string> = {};
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null) out[k] = String(v);
    }
    return out;
}

// Format yyyyMMddHHmmss theo GMT+7 (theo spec VNPAY)
function toGmt7YmdHis(d = new Date()) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const t = new Date(d.getTime() + (7 * 60 - d.getTimezoneOffset()) * 60000);
    return (
        t.getUTCFullYear().toString() +
        pad(t.getUTCMonth() + 1) +
        pad(t.getUTCDate()) +
        pad(t.getUTCHours()) +
        pad(t.getUTCMinutes()) +
        pad(t.getUTCSeconds())
    );
}

// Stringify theo application/x-www-form-urlencoded (space = '+') để khớp PHP urlencode
const rfc1738 = (o: Record<string, string | number>) =>
    qs.stringify(o, { encode: true, format: 'RFC1738' });

export class VnpayProvider implements PaymentGateway {
    constructor(private opts: Opts) { }

    async createPaymentSession({ orderId, amount, returnUrl, ipAddr }: CreatePaymentSessionInput) {
        const vnp_Url = this.opts.vnpUrl;
        const vnp_ReturnUrl = returnUrl || this.opts.returnUrl || '';
        // TxnRef chỉ chữ+số, đảm bảo unique
        const vnp_TxnRef = (String(orderId) + Date.now().toString().slice(-6)).replace(/[^A-Za-z0-9]/g, '');

        const vnp_CreateDate = toGmt7YmdHis(new Date());
        const vnp_ExpireDate = toGmt7YmdHis(new Date(Date.now() + 15 * 60 * 1000)); // +15 phút
        const vnp_IpAddr = ipAddr || '127.0.0.1';

        const vnp_Params: Record<string, string | number> = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: this.opts.tmnCode,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef,
            vnp_OrderInfo: `Thanh toan don hang #${orderId}`,
            vnp_OrderType: 'other',
            vnp_Amount: Math.round(Number(amount) * 100), // nhân 100 theo spec
            vnp_ReturnUrl,
            vnp_IpAddr,
            vnp_CreateDate,
            vnp_ExpireDate, // **bắt buộc**
            // vnp_BankCode: 'NCB', // optional
        };

        const sorted = sortObject(vnp_Params);
        // 1) build signData theo RFC1738
        const signData = rfc1738(sorted);

        // 2) HMAC-SHA512 (secret đã trim)
        const secureHash = crypto
            .createHmac('sha512', this.opts.hashSecret.trim())
            .update(signData, 'utf8')
            .digest('hex');

        // 3) final URL: encode cùng 1 kiểu với signData
        const url = `${vnp_Url}?${rfc1738({ ...sorted, vnp_SecureHash: secureHash })}`;
        return { url, provider: 'vnpay' };
    }

    async verifyCallback(payload: any): Promise<VerifyResult> {
        const input: Record<string, string> = {};
        for (const k of Object.keys(payload || {})) input[k] = String(payload[k]);

        const receivedHash = input['vnp_SecureHash'] || '';
        delete input['vnp_SecureHash'];
        delete input['vnp_SecureHashType'];

        const sorted = sortObject(input);
        const signData = rfc1738(sorted);
        const expectedHash = crypto
            .createHmac('sha512', this.opts.hashSecret.trim())
            .update(signData, 'utf8')
            .digest('hex');

        const valid = receivedHash.toLowerCase() === expectedHash.toLowerCase();

        const amount = Number(sorted['vnp_Amount'] || 0) / 100; // VNPAY trả về cũng *100
        const txnRef = sorted['vnp_TxnRef'] || '';
        const transNo = sorted['vnp_TransactionNo'] || '';
        const code = sorted['vnp_ResponseCode'];
        const transStatus = sorted['vnp_TransactionStatus'];

        const m = txnRef.match(/^(\d+)/);
        const orderId = m ? Number(m[1]) : 0;

        const success = code === '00' && (typeof transStatus === 'undefined' || transStatus === '00');
        return { valid, status: success ? 'PAID' : 'FAILED', orderId, amount, txnId: transNo || txnRef, raw: payload };
    }
}
