import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  getAppPassword,
  createSessionToken,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    let password = '';
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      password = body.password || '';
    } else {
      const formData = await request.formData();
      password = (formData.get('password') as string) || '';
    }

    if (!password) {
      return NextResponse.json({ error: 'Please enter a password' }, { status: 400 });
    }

    const expectedPassword = getAppPassword();
    if (password !== expectedPassword) {
      return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    const token = await createSessionToken();
    const isHttps =
      request.headers.get('x-forwarded-proto') === 'https' ||
      process.env.ENABLE_SECURE_COOKIE === 'true';

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Login failed: ${errorMsg}` }, { status: 500 });
  }
}
