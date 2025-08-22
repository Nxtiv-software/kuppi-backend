// models/Session.ts
import mongoose, { Document, Schema } from 'mongoose';

// Interface for Session document
export interface ISession extends Document {
  pollId: mongoose.Types.ObjectId | string;
  tutorId: mongoose.Types.ObjectId | string;
  tutorName: string;
  tutorEmail: string;
  subject: 'combined-maths' | 'physics' | 'chemistry';
  topic: string;
  title: string;
  description: string;
  date: Date; // scheduledDate
  time: string; // scheduledTime
  duration: number; // in hours
  feePerStudent: number;
  maxStudents: number;
  enrolledStudents: mongoose.Types.ObjectId[];
  status: 'upcoming' | 'completed' | 'cancelled';
  meetingLink?: string;
  materials?: string[];
  notes?: string;
  rating?: number;
  reason?: string; // cancellation reason
  createdAt: Date;
  updatedAt: Date;
}

// Session Schema
const SessionSchema = new Schema<ISession>({
  pollId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    ref: 'Poll',
    required: true,
    unique: true // One session per poll
  },
  tutorId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    ref: 'User',
    required: true
  },
  tutorName: {
    type: String,
    required: true,
    trim: true
  },
  tutorEmail: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    enum: ['combined-maths', 'physics', 'chemistry']
  },
  topic: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1, // minimum 1 hour
    max: 5 // maximum 5 hours
  },
  feePerStudent: {
    type: Number,
    required: true,
    min: 0
  },
  maxStudents: {
    type: Number,
    required: true,
    min: 1
  },
  enrolledStudents: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  meetingLink: {
    type: String,
    trim: true
  },
  materials: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  reason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
SessionSchema.index({ tutorId: 1, status: 1 });
SessionSchema.index({ date: 1, status: 1 });
SessionSchema.index({ enrolledStudents: 1 });

export default mongoose.model<ISession>('Session', SessionSchema);