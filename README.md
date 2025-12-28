# Betweener - Dating App 💕

A modern dating app for the Ghanaian community, built with React Native, Expo, and Supabase.

## 🚀 Tech Stack
- **React Native** with Expo SDK 54
- **Supabase** (PostgreSQL + Auth + Storage)
- **NativeWind** for styling
- **Expo Router** for navigation
- **Universal Links** for seamless email verification

## 🛠️ Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env` file with your Supabase credentials:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Database Setup**
   Run the migrations in the `supabase/migrations/` folder to set up your database schema.

4. **Universal Links Setup**
   See `UNIVERSAL_LINKS_SETUP.md` for complete instructions on setting up email verification deep linking.

5. **Start Development**
   ```bash
   npx expo start
   ```

6. **Create Development Build**
   ```bash
   eas build --platform ios --profile development
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## 📱 Features

### Authentication
- Email/password signup and login
- Email verification with Universal Links
- Password reset functionality
- Profile management with image upload
- Session persistence across app launches

### Security
- Row Level Security (RLS) policies
- Secure file upload with image optimization
- Protected routes with AuthGuard components

### Navigation
- File-based routing with Expo Router
- Tab navigation for main app sections
- Deep linking support for email verification

## Superlikes
- Quota: stored in `profiles.superlikes_left`, decremented via RPC `decrement_superlike(profile_id)` (requires update policy on profiles).
- Daily reset: function `reset_daily_superlikes()`; Edge Function `supabase/functions/reset-superlikes` included—deploy and schedule daily.
- Swipes use upsert; ensure the `Users can update swipes` RLS policy is applied so upserts aren’t blocked.

## 🏗️ Project Structure

```
app/
├── (auth)/          # Authentication screens
├── (tabs)/          # Main app tab navigation
├── _layout.tsx      # Root layout with auth provider
└── modal.tsx        # Modal screens

components/
├── auth-guard.tsx   # Route protection
├── ui/              # Reusable UI components
└── ...

lib/
├── auth-context.tsx # Authentication state management
└── supabase.ts     # Supabase client configuration

supabase/
└── migrations/     # Database migrations
```

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
