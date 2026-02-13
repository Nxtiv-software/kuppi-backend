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
    await mongoose.connect('mongodb+srv://nxtivsoftware:smarttutor2025@cluster0.adtzljr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
    
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