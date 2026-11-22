/** AUTH-1 / AUTH-2: same rule as the backend (UsernameSchema). The server stores usernames lowercase. */
export const USERNAME_PATTERN = '[A-Za-z0-9][A-Za-z0-9._\\-]{2,31}';
export const USERNAME_HINT = '3 to 32 characters: letters, digits, dot, dash or underscore.';

/** Props for a username <input>: no capitalisation or autocorrect on phones. */
export const usernameInputProps = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
  pattern: USERNAME_PATTERN,
  title: USERNAME_HINT,
} as const;
