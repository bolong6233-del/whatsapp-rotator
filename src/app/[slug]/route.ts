import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export async function GET(request, { params }) {
    const { slug } = params;

    // Use AbortSignal to set 2-second timeout for the fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const ip = request.headers.get('x-real-ip') || request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || request.ip;

    try {
        const response = await fetch(`https://api.tiktok.com/endpoint/${slug}`, { signal: controller.signal });
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            return NextResponse.json({ error: 'Request timed out' }, { status: 408 });
        }
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}