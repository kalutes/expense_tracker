'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  getAppPassword,
  createSessionToken,
} from '../../lib/auth';

export interface AuthState {
  error?: string;
}

export async function loginAction(
  _prevState: AuthState | null,
  formData: FormData
): Promise<AuthState | null> {
  const password = formData.get('password') as string;

  if (!password) {
    return { error: 'Please enter a password' };
  }

  const expectedPassword = getAppPassword();

  if (password !== expectedPassword) {
    return { error: 'Incorrect password. Please try again.' };
  }

  // Create signed session token
  const token = await createSessionToken();
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.ENABLE_SECURE_COOKIE === 'true',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  redirect('/');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}
