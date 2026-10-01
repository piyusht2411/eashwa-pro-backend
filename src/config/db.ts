import mongoose from 'mongoose';

export const connectDB = (url:string) => {
    console.log("Conneted to database successfully!")
    return mongoose.connect(url, {
        // The default is 30 s — a request would sit that long before failing
        // while the app shows a spinner. Fail quickly and let the user retry.
        serverSelectionTimeoutMS: 10000,
        // Small pool per serverless instance; Vercel runs many instances.
        maxPoolSize: 10,
    })
}