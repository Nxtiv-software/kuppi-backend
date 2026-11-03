import mongoose from 'mongoose';

const tutorApplicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: false }, // clerkId
    email: { type: String, required: false },

    // 3.1 Basic Information
    fullName: { type: String, required: true },
    nicNumber: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    phone: { type: String, required: true },
    district: { type: String, required: true },
    city: { type: String, required: true },

    // 3.2 Profile Information
    bio: { type: String, required: false },
    languages: [{ type: String }],

    // 3.3 Educational Background
    qualification: { type: String, required: true },
    university: { type: String },
    fieldOfStudy: { type: String },
    graduationYear: { type: Number },

    // 3.4 A/L Background
    alStream: { type: String },
    alResults: { type: String },

    // 3.5 Teaching Details
    subjects: [{ type: String }],
    grades: [{ type: String }],

    // 3.6 Teaching Experience
    experienceYears: { type: Number, default: 0 },
    experienceDescription: { type: String },

    // 3.7 Teaching Type
    teachingType: {
      type: String,
      enum: ['Online', 'Physical', 'Both'],
      required: true,
    },

    // 3.8 Availability
    availableDays: [{ type: String }],
    availability: { type: String }, // Available time text

    // 3.9 Optional Verification Links
    linkedin: { type: String },
    certificateLink: { type: String },

    // Application status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Admin notes
    adminNote: { type: String },
  },
  { timestamps: true }
);

tutorApplicationSchema.index({ userId: 1, status: 1 });

const TutorApplication = mongoose.model('TutorApplication', tutorApplicationSchema);
export default TutorApplication;
