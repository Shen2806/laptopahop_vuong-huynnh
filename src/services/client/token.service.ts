import jwt, { SignOptions } from "jsonwebtoken";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-secret";

// ép kiểu env sang SignOptions["expiresIn"]
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
    (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "15m";

const JWT_REFRESH_EXPIRES_IN: SignOptions["expiresIn"] =
    (process.env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]) || "7d";

export const generateAccessToken = (user: any) => {
    const roleName = user?.role?.name || user?.role?.roleName || "";
    return jwt.sign({ id: user.id, role: roleName }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
export const generateRefreshToken = (user: any) => {
    const payload = { id: user.id };
    return jwt.sign(payload, JWT_REFRESH_SECRET as jwt.Secret, { expiresIn: JWT_REFRESH_EXPIRES_IN });
};


