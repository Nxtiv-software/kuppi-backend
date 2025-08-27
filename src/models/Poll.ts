import mongoose, { Document, Schema } from 'mongoose';

export interface IPoll extends Document {
  title: string;
  subject: string;
  chapter: string;
  description: string;
  preferredDate: Date;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  maxStudents: number;
  creator: mongoose.Types.ObjectId | string; // Allow both ObjectId and string
  votes: mongoose.Types.ObjectId[] | string[];
  status: 'active' | 'completed' | 'scheduled' | 'accepted';
  targetVotes: number;
  scheduledDate?: Date;
  tutor?: mongoose.Types.ObjectId;
  acceptedBy?: mongoose.Types.ObjectId | string; // Tutor who accepted the request - allow both types
  sessionId?: mongoose.Types.ObjectId; // Reference to created session
  createdAt: Date;
  updatedAt: Date;
  checkScheduling: () => boolean;
  // Additional fields for flexible user handling
  createdBy?: string; // Optional string field for non-ObjectId user IDs
  creatorName?: string; // Optional creator name field
}

// Interface for static methods
export interface IPollModel extends mongoose.Model<IPoll> {
  getTrendingPolls(): Promise<IPoll[]>;
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
    enum: ['combined-maths', 'physics', 'chemistry']
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
    min: 1,
    max: 50
  },
  creator: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    required: true
  },
  // Additional fields for flexible user handling
  createdBy: {
    type: String,
    required: false // Optional string field for non-ObjectId user IDs
  },
  creatorName: {
    type: String,
    required: false // Optional creator name field
  },
  votes: [{
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'scheduled', 'accepted'],
    default: 'active'
  },
  targetVotes: {
    type: Number,
    default: 1 // Changed to 1 vote for easier testing (1 vote = 100%)
  },
  scheduledDate: {
    type: Date
  },
  tutor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  acceptedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    ref: 'User'
  },
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session'
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
        let: { creatorId: '$creator' },
        pipeline: [
          {
            $match: {
              $expr: {
                $cond: {
                  if: { $eq: [{ $type: '$$creatorId' }, 'objectId'] },
                  then: { $eq: ['$_id', '$$creatorId'] },
                  else: { $eq: ['$_id', { $toObjectId: '$$creatorId' }] }
                }
              }
            }
          },
          { $project: { name: 1, email: 1 } }
        ],
        as: 'creatorInfo'
      }
    },
    {
      $addFields: {
        voteCount: { $size: '$votes' },
        creator: {
          $cond: {
            if: { $gt: [{ $size: '$creatorInfo' }, 0] },
            then: { $arrayElemAt: ['$creatorInfo', 0] },
            else: {
              name: { $ifNull: ['$creatorName', 'Unknown User'] },
              _id: '$creator'
            }
          }
        }
      }
    },
    {
      $project: {
        creatorInfo: 0 // Remove the temporary field
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

  
export default mongoose.model<IPoll, IPollModel>('Poll', PollSchema);