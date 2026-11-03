import mongoose from 'mongoose';

const appSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default'
    },
    siteName: {
      type: String,
      default: 'Kuppi.lk'
    },
    logoUrl: {
      type: String,
      default: ''
    },
    defaultTimezone: {
      type: String,
      default: 'Asia/Colombo'
    },
    defaultLanguage: {
      type: String,
      enum: ['en', 'si'],
      default: 'en'
    },
    emailFromName: {
      type: String,
      default: 'Kuppi'
    },
    emailFromAddress: {
      type: String,
      default: 'support@kuppi.lk'
    },
    maintenanceMode: {
      type: Boolean,
      default: false
    },
    notifications: {
      systemEmailEnabled: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
);

const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
