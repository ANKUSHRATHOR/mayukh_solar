import { z } from 'zod';

/**
 * Shared zod pieces for the domain's recurring fields.
 *
 * `validateMobile` was previously redefined identically in CreateLead, Login
 * and AddStaff; keeping one definition means a rule change lands everywhere.
 */

/** Indian mobile: 10 digits starting 6–9. */
export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const optionalMobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
  .or(z.literal(''))
  .optional();

export const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address');

export const optionalEmailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .or(z.literal(''))
  .optional();

/** DISCOM consumer number — 12 digits for CESC Rajasthan. */
export const kNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'K-Number must be exactly 12 digits');

export const optionalKNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, 'K-Number must be exactly 12 digits')
  .or(z.literal(''))
  .optional();

/** Non-empty text with a friendly message naming the field. */
export const requiredText = (field: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be under ${max} characters`);

/**
 * Numeric input from a text field. HTML inputs yield strings, so coerce and
 * reject blanks explicitly rather than letting `Number('')` become 0 — the
 * existing forms silently save zero for an empty amount.
 */
export const positiveNumber = (field: string) =>
  z
    .union([z.string(), z.number()])
    .refine((v) => String(v).trim() !== '', { message: `${field} is required` })
    .transform((v) => Number(v))
    .refine((n) => Number.isFinite(n), { message: `${field} must be a number` })
    .refine((n) => n > 0, { message: `${field} must be greater than zero` });

export const optionalNumber = (field: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === '' || v === undefined || v === null ? null : Number(v)))
    .refine((n) => n === null || Number.isFinite(n), { message: `${field} must be a number` });

/** Non-negative money amount, for discounts and payments. */
export const currencyAmount = (field: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === undefined || v === null ? 0 : Number(v)))
    .refine((n) => Number.isFinite(n), { message: `${field} must be a number` })
    .refine((n) => n >= 0, { message: `${field} cannot be negative` });

export const appRoleSchema = z.enum([
  'admin',
  'telecaller',
  'sales_person',
  'operator',
  'welder',
  'electrician',
]);

export type AppRole = z.infer<typeof appRoleSchema>;
