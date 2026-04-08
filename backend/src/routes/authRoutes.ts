import { type Request, type Response, Router } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { UserModel } from "../models/User";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(80)
});

const updateNameSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

const googleAuthSchema = z.object({
  credential: z.string().min(1)
});

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const deriveFallbackName = (email: string) => {
  const localPart = email.split("@")[0] ?? "there";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 80) : "there";
};

const signToken = (userId: string, email: string): string =>
  jwt.sign({ sub: userId, email }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
  });

const buildAuthResponse = (user: { _id: { toString(): string }; email: string; name?: string }) => ({
  token: signToken(user._id.toString(), user.email),
  user: {
    id: user._id.toString(),
    email: user.email,
    name: user.name?.trim() ? user.name : deriveFallbackName(user.email)
  }
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    return;
  }

  const { email, password, name } = parsed.data;
  const existing = await UserModel.findOne({ email });

  if (existing) {
    res.status(409).json({ message: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await UserModel.create({ email, passwordHash, name });
  res.status(201).json(buildAuthResponse(created));
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await UserModel.findOne({ email });

  if (!user || !user.passwordHash) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  res.json(buildAuthResponse(user));
});

router.post("/google", async (req, res) => {
  const parsed = googleAuthSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified || !payload.sub) {
      res.status(401).json({ message: "Google account could not be verified" });
      return;
    }

    const email = payload.email.toLowerCase();
    let user = await UserModel.findOne({ googleId: payload.sub });

    if (!user) {
      user = await UserModel.findOne({ email });
    }

    if (!user) {
      user = await UserModel.create({
        email,
        googleId: payload.sub,
        name: payload.name?.trim() || payload.given_name?.trim() || deriveFallbackName(email)
      });
    } else {
      let shouldSave = false;

      if (!user.googleId) {
        user.googleId = payload.sub;
        shouldSave = true;
      }

      if (!user.name?.trim()) {
        user.name = payload.name?.trim() || payload.given_name?.trim() || deriveFallbackName(email);
        shouldSave = true;
      }

      if (shouldSave) {
        user = await user.save();
      }
    }

    res.json(buildAuthResponse(user));
  } catch {
    res.status(401).json({ message: "Google sign-in failed" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name?.trim() ? user.name : deriveFallbackName(user.email)
    }
  });
});

const updateNameHandler = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = updateNameSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
    return;
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { name: parsed.data.name } },
    { new: true }
  );

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name
    }
  });
};

router.patch("/me/name", authMiddleware, updateNameHandler);
router.put("/me/name", authMiddleware, updateNameHandler);

export default router;
