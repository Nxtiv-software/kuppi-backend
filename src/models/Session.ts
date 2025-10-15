// models/Session.ts
import mongoose, { Document, Schema } from 'mongoose';

// Interface for Session document
// Interface for Attachment
export interface IAttachment {
  fileName: string;
  originalName: string;
  description?: string;
  uploadedAt: Date;
  fileSize: number;
  mimeType: string;
}

// Interface for Announcement
export interface IAnnouncement {
  message: string;
  addedAt: Date;
}

export interface ISession extends Document {
  pollId?: mongoose.Types.ObjectId | string; // Optional for tutor-created sessions
  tutorId: mongoose.Types.ObjectId | string;
  tutorName: string;
  tutorEmail: string;
  subject: 'combined-maths' | 'physics' | 'chemistry';
  topic: string;
  title: string;
  description: string;
  date?: Date; // scheduledDate - optional until scheduled
  time?: string; // scheduledTime - optional until scheduled
  duration: number; // in hours
  fee?: number; // Optional for backward compatibility
  feePerStudent: number;
  maxStudents: number;
  minStudents?: number; // For tutor-created sessions
  enrolledStudents: (mongoose.Types.ObjectId | string)[];
  interestedStudents?: (mongoose.Types.ObjectId | string)[]; // For tutor-created sessions
  status: 'upcoming' | 'completed' | 'cancelled' | 'open_for_interest' | 'ready_to_schedule' | 'scheduled';
  meetingLink?: string;
  materials?: string[];
  attachments?: IAttachment[];
  announcements?: IAnnouncement[];
  notes?: string;
  schedulingNote?: string; // For tutor-created sessions
  rating?: number;
  reason?: string; // cancellation reason
  source?: 'poll_based' | 'tutor_created'; // Track session origin
  isScheduled?: boolean; // Explicit scheduling flag
  createdAt: Date;
  updatedAt: Date;
}

// Session Schema
const SessionSchema = new Schema<ISession>({
  pollId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    ref: 'Poll',
    required: false // Optional for tutor-created sessions
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
    required: false, // Make optional since we have tutorId for reference
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
    required: false // Optional until scheduled
  },
  time: {
    type: String,
    required: false, // Optional until scheduled
    trim: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1, // minimum 1 hour
    max: 5 // maximum 5 hours
  },
  fee: {
    type: Number,
    min: 0 // For backward compatibility
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
  minStudents: {
    type: Number,
    min: 1,
    default: 1
  },
  enrolledStudents: [Schema.Types.Mixed], // Allow both ObjectId and String user IDs
  interestedStudents: [Schema.Types.Mixed], // For tutor-created sessions
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'cancelled', 'open_for_interest', 'ready_to_schedule', 'scheduled'],
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
  attachments: [{
    fileName: {
      type: String,
      required: true,
      trim: true
    },
    originalName: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true,
      trim: true
    }
  }],
  announcements: [{
    message: {
      type: String,
      required: true,
      trim: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  schedulingNote: {
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
  },
  source: {
    type: String,
    enum: ['poll_based', 'tutor_created'],
    default: 'poll_based'
  },
  isScheduled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
SessionSchema.index({ tutorId: 1, status: 1 });
SessionSchema.index({ date: 1, status: 1 });
SessionSchema.index({ enrolledStudents: 1 });
// Sparse unique index for pollId - allows multiple null values but ensures uniqueness for non-null values
SessionSchema.index({ pollId: 1 }, { unique: true, sparse: true });

export default mongoose.model<ISession>('Session', SessionSchema);