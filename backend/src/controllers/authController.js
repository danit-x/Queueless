import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail } from "../models/userModel.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration({ name, email, password, confirmPassword }) {
  if (!name?.trim() || !email?.trim() || !password || !confirmPassword) {
    return "All fields are required.";
  }

  if (!emailPattern.test(email)) {
    return "Please enter a valid email address.";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}

function validateLogin({ email, password }) {
  if (!email?.trim() || !password) {
    return "Email and password are required.";
  }

  if (!emailPattern.test(email)) {
    return "Please enter a valid email address.";
  }

  return null;
}

function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

export async function register(req, res) {
  const validationError = validateRegistration(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const { name, email, password } = req.body;

  try {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({
      name: name.trim(),
      email: email.trim(),
      passwordHash,
    });

    return res.status(201).json({ message: "Registration successful.", user });
  } catch (error) {
    return res.status(500).json({ message: "Unable to register user right now." });
  }
}

export async function login(req, res) {
  const validationError = validateLogin(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const { email, password } = req.body;

  try {
    const userRecord = await findUserByEmail(email);

    if (!userRecord) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, userRecord.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: userRecord.role,
      created_at: userRecord.created_at,
    };

    return res.json({ token: createToken(user), user });
  } catch (error) {
    return res.status(500).json({ message: "Unable to log in right now." });
  }
}

export async function getMe(req, res) {
  return res.json({ user: req.user });
}

