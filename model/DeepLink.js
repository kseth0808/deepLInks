import mongoose from "mongoose";

const deepLinkSchema = new mongoose.Schema(
    {
        slug: { type: String, required: true, unique: true },
        appId: { type: String, required: true },
        route: { type: String, default: "/" },
        params: { type: Object, default: {} },
        isActive: { type: Boolean, default: true },

        clicks: [
            {
                timestamp: { type: Date, default: Date.now },
                ip: String,
                platform: String,
            },
        ],
    },
    { timestamps: true }
);

const DeepLink = mongoose.model("DeepLink", deepLinkSchema);

export default DeepLink;
