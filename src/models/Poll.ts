import mongoose, { Document, Schema } from 'mongoose';

export interface IPoll extends Document {
  title: string;
  subject: string;
  chapter: string;
  description: string;
  preferredDate: Date;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  maxStudents: number;
  creator: mongoose.Types.ObjectId;
  votes: mongoose.Types.ObjectId[];
  status: 'active' | 'completed' | 'scheduled';
  targetVotes: number;
  scheduledDate?: Date;
  tutor?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  checkScheduling: () => boolean;
  getTrendingPolls: () => Promise<IPoll[]>;
}

const PollSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  subject: {
    type: String,
    required: true,
    enum: ['data-structures', 'algorithms', 'database', 'web-dev', 'mobile-dev']
  },
  chapter: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  preferredDate: {
    type: Date,
    required: true
  },
  timeSlot: {
    type: String,
    required: true,
    enum: ['morning', 'afternoon', 'evening']
  },
  maxStudents: {
    type: Number,
    required: true,
    min: 5,
    max: 50
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  votes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'scheduled'],
    default: 'active'
  },
  targetVotes: {
    type: Number,
    default: 7 // Updated to 7 votes for trending
  },
  scheduledDate: {
    type: Date
  },
  tutor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
PollSchema.index({ subject: 1, status: 1, createdAt: -1 });
PollSchema.index({ creator: 1 });
PollSchema.index({ votes: 1 });

// Virtual for vote count
PollSchema.virtual('voteCount').get(function(this: any) {
  return this.votes.length;
});

// Method to check if poll should be scheduled
PollSchema.methods.checkScheduling = function(this: IPoll) {
  if (this.votes.length >= this.targetVotes && this.status === 'active') {
    this.status = 'scheduled';
    return true;
  }
  return false;
};

// Static method to get trending polls (7 or more votes)
PollSchema.statics.getTrendingPolls = function(this: mongoose.Model<IPoll>) {
  return this.aggregate([
    {
      $match: {
        status: 'active',
        $expr: { $gte: [{ $size: '$votes' }, 7] }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'creator',
        foreignField: '_id',
        as: 'creator',
        pipeline: [{ $project: { name: 1, email: 1 } }]
      }
    },
    {
      $unwind: '$creator'
    },
    {
      $addFields: {
        voteCount: { $size: '$votes' }
      }
    },
    {
      $sort: { voteCount: -1, createdAt: -1 }
    },
    {
      $limit: 10
    }
  ]);
};

  
export default mongoose.model<IPoll>('Poll', PollSchema);