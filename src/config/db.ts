import mongoose from "mongoose";

export const connectDB = async () => {
    try {
    const connnectionString = process.env.MONGODB_URI;
    if(!connnectionString) {
        throw new Error("Pleaes add the connection String")
    }
    await mongoose.connect(connnectionString);
    console.log("DB connection successfull!")
    } catch (error) {
        console.log("DB connection failed!")
    }
}