import "dotenv/config";

export function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}
