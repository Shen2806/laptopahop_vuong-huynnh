import { Request, Response } from 'express';
import { prisma } from 'config/client';

export const getProvinces = async (_: Request, res: Response) => {
    const data = await prisma.province.findMany({ orderBy: { name: 'asc' } });
    res.json(data);
};

export const getDistricts = async (req: Request, res: Response) => {
    const provinceCode = Number(req.query.provinceCode);
    if (!provinceCode) return res.json([]);
    const data = await prisma.district.findMany({
        where: { provinceCode },
        orderBy: { name: 'asc' },
    });
    res.json(data);
};

export const getWards = async (req: Request, res: Response) => {
    const districtCode = Number(req.query.districtCode);
    if (!districtCode) return res.json([]);
    const data = await prisma.ward.findMany({
        where: { districtCode },
        orderBy: { name: 'asc' },
    });
    res.json(data);
};
