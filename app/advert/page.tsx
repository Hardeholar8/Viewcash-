import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";

function validSession(value: string | undefined, secret: string) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, timestamp, signature] = parts;
  const payload = `${id}.${timestamp}`;
  const age = Date.now() - Number(timestamp);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(timestamp) || !signature || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export default async function AdvertPage() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const session = (await cookies()).get("viewcash_admin")?.value;
  if (!secret || !validSession(session, secret)) redirect("/");

  return (
    <main className="mx-auto min-h-screen max-w-md bg-[#070b14] px-4 py-6 text-white">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300">AD</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">ViewCash</p>
          <h1 className="text-xl font-black">Advert</h1>
        </div>
      </div>

      <section className="mt-6 rounded-[1.7rem] border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[.10] via-white/[.035] to-transparent p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-400/10 text-3xl">📢</div>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Private development</p>
        <h2 className="mt-2 text-2xl font-black">Coming Soon</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-slate-400">
          Advert posting and management are being prepared. This area is currently available only to the ViewCash owner for development and testing.
        </p>
      </section>

      <button onClick={() => window.location.assign("/")} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[.035] py-3 text-sm font-bold text-slate-200">
        Back to ViewCash
      </button>
    </main>
  );
}
