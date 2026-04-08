import express from 'express';
import { requireAuth } from '../middlewares/clerkAuth';
import { isAdmin } from '../middlewares/adminAuth';
import {
  createReminder,
  getCampaigns,
  getReminderLogs,
  getReminders,
  runReminderNow,
  sendCampaign,
  toggleReminderStatus,
  updateReminder
} from '../controllers/communicationController';

const router = express.Router();

router.use(requireAuth);
router.use(isAdmin);

router.get('/campaigns', getCampaigns);
router.post('/campaigns', sendCampaign);

router.get('/reminders', getReminders);
router.post('/reminders', createReminder);
router.patch('/reminders/:reminderId', updateReminder);
router.patch('/reminders/:reminderId/toggle', toggleReminderStatus);
router.post('/reminders/:reminderId/run', runReminderNow);
router.get('/reminders/:reminderId/logs', getReminderLogs);

export default router;
