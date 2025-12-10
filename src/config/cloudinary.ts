// src/config/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import 'dotenv/config';

// Không cần truyền tham số, SDK tự đọc CLOUDINARY_URL
cloudinary.config();

export default cloudinary;
