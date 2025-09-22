import 'dotenv/config';
import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { findOrCreateUserFromGoogle } from '../services/client/google-auth.service';


const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_CALLBACK_URL = (process.env.GOOGLE_CALLBACK_URL || '').trim();


if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    throw new Error('Missing Google OAuth env');
}


passport.use(
    new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: GOOGLE_CALLBACK_URL,
        },
        async (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) return done(null, false, { message: 'No email from Google' });
                const user = await findOrCreateUserFromGoogle({
                    email,
                    fullName: profile.displayName || email,
                    googleId: profile.id,
                });
                return done(null, user);
            } catch (e) {
                return done(e as any, false);
            }
        }
    )
);


export default passport;