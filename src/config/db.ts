import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        const connectionString = process.env.MONGODB_URI;
        if(!connectionString) {
            throw new Error("Please add the connection String")
        }
        
        // Try different connection strategies based on the connection string
        let options: any = {
            retryWrites: true,
            w: 'majority' as const,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        // If it's MongoDB Atlas, add SSL configuration
        if (connectionString.includes('mongodb+srv://') || connectionString.includes('.mongodb.net')) {
            options = {
                ...options,
                ssl: true,
                // For Atlas, let MongoDB handle SSL validation
                tls: true,
                tlsAllowInvalidCertificates: false, // Set to true if you have certificate issues
            };
        }
        
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(connectionString, options);
        console.log("DB connection successful!")
    } catch (error) {
        console.log("DB connection failed!", error)
        
        // Try fallback connection without SSL for local development
        if (process.env.NODE_ENV === 'development') {
            try {
                console.log('Trying fallback connection without SSL...');
                const connectionString = process.env.MONGODB_URI;
                if (connectionString) {
                    await mongoose.connect(connectionString, {
                        retryWrites: true,
                        w: 'majority' as const,
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 45000,
                    });
                    console.log("DB connection successful with fallback!")
                    return;
                }
            } catch (fallbackError) {
                console.log("Fallback connection also failed:", fallbackError);
            }
        }
        
        throw error; // Re-throw to handle upstream
    }
}