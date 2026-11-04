import express from 'express';
import { requireAuth } from '../middlewares/clerkAuth';
import { isAdmin } from '../middlewares/adminAuth';
import {
  getAppSettings,
  getMySettings,
  getPublicAppSettings,
  updateAppSettings,
  updateMySettings
} from '../controllers/settingsController';

const router = express.Router();

router.get('/public', getPublicAppSettings);

router.use(requireAuth);

router.get('/me', getMySettings);
router.patch('/me', updateMySettings);

router.get('/app', isAdmin, getAppSettings);
router.patch('/app', isAdmin, updateAppSettings);

export default router;
