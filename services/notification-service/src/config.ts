import 'dotenv/config';

export const config = {
  port: Number(process.env.SERVICE_PORT ?? 8004),
  redisUrl: process.env.REDIS_URL ?? 'redis://:dev_password@redis:6379/0',
  internalSecret: process.env.INTERNAL_SHARED_SECRET ?? 'dev-secret',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  fromEmail: process.env.FROM_EMAIL ?? 'noreply@comstruct.com',
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
  apnsKeyPath: process.env.APNS_KEY_PATH ?? '',
  apnsKeyId: process.env.APNS_KEY_ID ?? '',
  apnsTeamId: process.env.APNS_TEAM_ID ?? '',
  apnsBundleId: process.env.APNS_BUNDLE_ID ?? 'com.comstruct.mobile',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
