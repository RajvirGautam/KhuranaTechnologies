import mongoose, { type InferSchemaType } from "mongoose";

export const APPLICATION_STATUSES = [
  "Applied",
  "Phone Screen",
  "Interview",
  "Offer",
  "Rejected"
] as const;

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    company: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    jdLink: { type: String, default: "" },
    notes: { type: String, default: "" },
    dateApplied: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: "Applied"
    },
    salaryRange: { type: String, default: "" },
    isPinned: { type: Boolean, default: false },
    requiredSkills: { type: [String], default: [] },
    niceToHaveSkills: { type: [String], default: [] },
    seniority: { type: String, default: "" },
    location: { type: String, default: "" },
    resumeSuggestions: { type: [String], default: [] },
    nextFollowUpDate: { type: Date, default: null },
    followUpNote: { type: String, default: "" },
    followUpCompletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type ApplicationDocument = InferSchemaType<typeof applicationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ApplicationModel = mongoose.model("Application", applicationSchema);
