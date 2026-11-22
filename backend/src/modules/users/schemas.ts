import { z } from 'zod';

const themeId = z.string().min(1).max(64);

/** User preferences that follow the user across devices (docs/data-model.md, users.preferences). */
export const PreferencesSchema = z
  .object({
    theme: themeId.describe('Theme id (docs/theming.md)'),
    noteSort: z.enum(['favorites', 'updated', 'title', 'category']).describe('Order of the notes grid (NOTE-9)'),
  })
  .partial();

export const PreferencesInputSchema = PreferencesSchema.strict();

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  preferences: PreferencesSchema,
});

/** AUTH-2: stored lowercase; same rule as the users_username_format CHECK constraint. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9._-]{2,31}$/,
        'Username: 3 to 32 characters, letters, digits, dot, dash or underscore, starting with a letter or digit',
      ),
  );
export const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200);

export function toUser(user: { id: string; username: string; preferences: unknown }): z.infer<typeof UserSchema> {
  const prefs = PreferencesSchema.safeParse(user.preferences);
  return {
    id: user.id,
    username: user.username,
    preferences: prefs.success ? prefs.data : {},
  };
}
