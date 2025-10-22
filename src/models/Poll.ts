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
  declinedBy?: (mongoose.Types.ObjectId | string)[]; // Tutors who declined the request
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
    default: 3 // Default to 3 votes (will be overridden during creation)
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
  declinedBy: [{
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String - tutors who declined
    ref: 'User'
  }],
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

// Static method to get trending polls (70% or more votes relative to maxStudents)
PollSchema.statics.getTrendingPolls = function(this: mongoose.Model<IPoll>) {
  return this.aggregate([
    {
      $match: {
        status: 'active',
        maxStudents: { $gt: 0 } // Ensure maxStudents is greater than 0 to avoid division by zero
      }
    },
    {
      $addFields: {
        voteCount: { $size: { $ifNull: ['$votes', []] } }, // Handle null votes array
        votePercentage: {
          $cond: {
            if: { $and: [
              { $gt: ['$maxStudents', 0] },
              { $isArray: '$votes' }
            ]},
            then: {
              $multiply: [
                { $divide: [{ $size: '$votes' }, '$maxStudents'] },
                100
              ]
            },
            else: 0
          }
        }
      }
    },
    {
      $match: {
        votePercentage: { $gte: 70 } // 70% or more votes
      }
    },
    {
      $lookup: {
        from: 'users',
        let: { creatorId: { $toString: '$creator' } },
        pipeline: [
          {
            $match: {
              $expr: { $eq: [{ $toString: '$_id' }, '$$creatorId'] }
            }
          },
          { $project: { name: 1, email: 1 } }
        ],
        as: 'creatorInfo'
      }
    },
    {
      $addFields: {
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