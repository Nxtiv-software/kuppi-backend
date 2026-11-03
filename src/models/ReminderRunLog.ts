import mongoose, { Document, Schema } from 'mongoose';

export interface IReminderRunLog extends Document {
  ruleId: mongoose.Types.ObjectId | string;
  status: 'success' | 'failed' | 'skipped';
  recipientsCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount?: number;
  error?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderRunLogSchema = new Schema<IReminderRunLog>(
  {
    ruleId: { type: Schema.Types.Mixed, required: true, index: true },
    status: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
    recipientsCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    error: { type: String, default: null },
    notes: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    runAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

ReminderRunLogSchema.index({ ruleId: 1, runAt: -1 });

export default mongoose.model<IReminderRunLog>('ReminderRunLog', ReminderRunLogSchema);
