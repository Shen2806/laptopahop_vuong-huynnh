import { Router } from 'express';
import * as ctrl from '../controllers/location.controller';

const router = Router();
router.get('/api/locations/provinces', ctrl.getProvinces);
router.get('/api/locations/districts', ctrl.getDistricts);
router.get('/api/locations/wards', ctrl.getWards);

export default router;
