import mongoose from "mongoose";

const connectDB = async () => {
    const uri = "mongodb+srv://kseth0808:bHNfCSE6Jw0iEaWB@cluster0.birwq.mongodb.net/dataManagement?retryWrites=true&w=majority&appName=Cluster0";
    try {
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
        console.log("❌ Failed to connect to MongoDB Atlas:", err);
        process.exit(1);
    }
};

export default connectDB;
