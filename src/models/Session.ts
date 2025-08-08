// models/Session.ts
import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  poll: { type: mongoose.Types.ObjectId, ref: 'Poll', required: true },
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  scheduledDate: { type: Date, required: true },
  timeSlot: { type: String, required: true },
  maxStudents: { type: Number, required: true },
  students: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['scheduled', 'completed'], default: 'scheduled' },
  tutor: { type: mongoose.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Session', SessionSchema);