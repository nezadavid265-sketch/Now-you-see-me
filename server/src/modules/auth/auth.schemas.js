import { z } from 'zod';
import { email, optionalPhone, password, personName } from '../../lib/validators.js';

export const registerSchema = z.object({
  name: personName,
  email,
  phone: optionalPhone,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
