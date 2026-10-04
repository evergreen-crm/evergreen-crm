// Reads Evergreen's settings from "evergreen-keys.txt" (easy to edit in Notepad).
// Format: one NAME=value per line. That file is private: never share it or upload it.
const fs = require('fs');
const path = require('path');

const keys = {};
try {
  const text = fs.readFileSync(path.join(__dirname, 'evergreen-keys.txt'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) {
      const name = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (name && value) keys[name] = value;
    }
  }
} catch {
  // No keys file: fall back to .env.local
}

// Server-only secret
if (keys.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = keys.SUPABASE_SERVICE_ROLE_KEY;

const publicUrl = keys.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = keys.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (publicUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
if (publicKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = publicKey;

/** @type {import('next').NextConfig} */
module.exports = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
  },
};
