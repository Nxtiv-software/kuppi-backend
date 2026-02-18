require('dotenv').config();
const mongoose = require('mongoose');

// User schema
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  role: { type: String, enum: ['student', 'tutor', 'admin'], default: 'student' },
  clerkId: { type: String },
  lastSyncedAt: { type: Date }
});

const User = mongoose.model('User', userSchema);

async function checkUser() {
  try {
    const connectionString = process.env.MONGODB_URI;
    if (!connectionString) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    await mongoose.connect(connectionString);
    
    const user = await User.findOne({ email: 'nxtivsoftware@gmail.com' });
    console.log('🔍 Current user state:');
    
    if (user) {
      console.log({
        email: user.email,
        role: user.role,
        clerkId: user.clerkId,
        lastSyncedAt: user.lastSyncedAt
      });
    } else {
      console.log('❌ User not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUser();