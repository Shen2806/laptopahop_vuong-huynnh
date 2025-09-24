export interface CreatePaymentSessionInput {
    orderId: number;
    amount: number;       // VND
    returnUrl: string;    // absolute URL
    ipAddr?: string;      // client IP (optional)
}

export interface VerifyResult {
    valid?: boolean;          // <-- thêm: checksum OK?
    status: 'PAID' | 'FAILED' | 'PENDING';
    orderId: number;
    txnId?: string;
    amount?: number;      // VND
    raw?: any;
}

export interface PaymentGateway {
    createPaymentSession(input: CreatePaymentSessionInput): Promise<{ url: string; provider: string }>;
    verifyCallback(payload: any): Promise<VerifyResult>;
}
