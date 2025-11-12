// upload.ts
import express, { Request, Response } from 'express';
import multer, { Multer } from 'multer';
import {
    v2 as cloudinary,
    UploadApiResponse,
    UploadApiErrorResponse,
    UploadApiOptions,
} from 'cloudinary';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function uploadBufferToCloudinary(
    buffer: Buffer,
    options: UploadApiOptions = {}
): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'blog', resource_type: 'image', quality: 'auto', ...options },
            (err?: UploadApiErrorResponse, result?: UploadApiResponse) => {
                if (err) return reject(err);
                if (!result) return reject(new Error('Empty Cloudinary response'));
                resolve(result);
            }
        );
        stream.end(buffer); // đẩy buffer vào stream
    });
}

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const file = req.file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ error: 'No file provided' });

        const result = await uploadBufferToCloudinary(file.buffer);

        res.json({
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        res.status(500).json({ error: msg });
    }
});

export default router;
