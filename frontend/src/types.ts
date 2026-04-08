export const STATUSES = [
  "Applied",
  "Phone Screen",
  "Interview",
  "Offer",
  "Rejected"
] as const;

export type ApplicationStatus = (typeof STATUSES)[number];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Application {
  _id: string;
  company: string;
  role: string;
  jdLink: string;
  notes: string;
  dateApplied: string;
  status: ApplicationStatus;
  salaryRange: string;
  isPinned: boolean;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  seniority: string;
  location: string;
  resumeSuggestions: string[];
  nextFollowUpDate?: string | null;
  followUpNote?: string;
  followUpCompletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParseJobResponse {
  parsed: {
    companyName: string;
    role: string;
    salaryRange: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
    seniority: string;
    location: string;
  };
}
