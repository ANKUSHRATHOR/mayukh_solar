/**
 * The redirect the native app hands to Supabase for OAuth.
 *
 * Must match, exactly and in three places:
 *   - Supabase → Authentication → URL Configuration → Redirect URLs
 *   - the intent-filter in android/app/src/main/AndroidManifest.xml
 *   - CFBundleURLTypes in ios/App/App/Info.plist
 *
 * The scheme is the appId, which is what Capacitor registers by convention
 * (see `custom_url_scheme` in android/app/src/main/res/values/strings.xml).
 *
 * Kept in its own module so `src/pages/Login.tsx` can import the constant
 * without pulling in the deep-link listener.
 */
export const NATIVE_AUTH_REDIRECT = 'in.mayukhsolar.crm://auth/callback';
